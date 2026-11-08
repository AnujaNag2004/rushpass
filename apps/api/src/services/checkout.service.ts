import { Prisma } from '@prisma/client';
import type { CheckoutOrderDTO } from '@rushpass/shared';
import { priceBreakdown, tierPrice } from '@rushpass/shared';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { withIdempotency } from '../lib/idempotency.js';
import { signTicketToken } from '../lib/jwt.js';
import { seatOwners } from '../lib/locks.js';
import { logger } from '../lib/logger.js';
import { incrMetric } from '../lib/metrics.js';
import { activeProvider, mockProvider, providerByName } from '../lib/payments/index.js';
import { prisma } from '../lib/prisma.js';
import { enqueueEmail } from '../jobs/scheduler.js';
import { consumeSeats, findGroupHold, holdSeatMap, readHold } from './holds.service.js';
import { onMemberPaid, onMemberPaymentFailed } from './groups.service.js';
import { broadcastSeats, venueSeats } from './seatState.service.js';

interface OrderInput {
  userId: string;
  holdId?: string;
  groupCode?: string;
  idempotencyKey?: string;
}

/** Creates a PENDING booking + gateway order for the seats the user is holding. */
export function createOrder(input: OrderInput): Promise<CheckoutOrderDTO> {
  return withIdempotency(input.userId, input.idempotencyKey, () => createOrderInner(input));
}

async function createOrderInner({ userId, holdId, groupCode, idempotencyKey }: OrderInput): Promise<CheckoutOrderDTO> {
  let hold;
  let groupRoomId: string | null = null;
  let expiresAt: number;

  if (groupCode) {
    const room = await prisma.groupRoom.findUnique({ where: { code: groupCode }, include: { members: true } });
    if (!room) throw notFound('Group room');
    const member = room.members.find((m) => m.userId === userId);
    if (!member) throw forbidden('You are not in this group');
    if (room.status !== 'PAYING') throw badRequest('Wait for the host to lock in seats');
    if (member.paymentStatus === 'PAID') throw conflict('ALREADY_PAID', 'You have already paid for this group');
    hold = await findGroupHold(room.code);
    if (!hold) throw conflict('HOLD_EXPIRED', 'The group hold has expired');
    groupRoomId = room.id;
    expiresAt = room.expiresAt?.getTime() ?? hold.expiresAt;
  } else {
    hold = holdId ? await readHold(holdId) : null;
    if (!hold || hold.expiresAt < Date.now()) throw conflict('HOLD_EXPIRED', 'Your seat hold has expired');
    if (hold.kind !== 'SOLO' || hold.userId !== userId) throw forbidden('This hold is not yours');
    expiresAt = hold.expiresAt;
  }

  const map = await holdSeatMap(hold.id);
  const seatIds = Object.keys(map).filter((sid) => map[sid] === userId);
  if (!seatIds.length) throw badRequest('You have no seats selected');

  const show = await prisma.show.findUniqueOrThrow({ where: { id: hold.showId } });
  const seats = (await venueSeats(show.venueId)).filter((s) => seatIds.includes(s.id));
  const breakdown = priceBreakdown(seats.reduce((sum, s) => sum + tierPrice(show, s.tier), 0));

  // Any older pending attempt for this hold is superseded.
  await prisma.booking.updateMany({
    where: { userId, holdId: hold.id, status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  const provider = activeProvider();
  const booking = await prisma.booking.create({
    data: {
      userId,
      showId: show.id,
      groupRoomId,
      holdId: hold.id,
      heldSeatIds: seatIds,
      status: 'PENDING',
      ...breakdown,
    },
  });
  const order = await provider.createOrder(breakdown.total, booking.id);
  await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider: provider.name,
      providerOrderId: order.orderId,
      amount: breakdown.total,
      idempotencyKey: idempotencyKey ? `${userId}:${idempotencyKey}` : null,
    },
  });

  return {
    bookingId: booking.id,
    provider: provider.name,
    orderId: order.orderId,
    amount: breakdown.total,
    currency: 'INR',
    keyId: provider.publicKey,
    expiresAt,
    breakdown,
  };
}

export interface ConfirmInput {
  userId?: string;
  bookingId?: string;
  providerOrderId: string;
  providerPaymentId: string;
  signature?: string;
}

/** Client-side confirmation (Razorpay handler / mock sheet). Verifies the gateway signature. */
export async function confirmPayment(input: ConfirmInput) {
  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: input.providerOrderId },
    include: { booking: true },
  });
  if (!payment || (input.bookingId && payment.bookingId !== input.bookingId)) throw notFound('Order');
  if (input.userId && payment.booking.userId !== input.userId) throw forbidden();
  const provider = providerByName(payment.provider);
  const ok = provider.verifyPayment({
    orderId: input.providerOrderId,
    paymentId: input.providerPaymentId,
    signature: input.signature,
  });
  if (!ok) throw new AppError(400, 'INVALID_SIGNATURE', 'Payment could not be verified');
  return finalizeBooking(payment.bookingId, input.providerPaymentId);
}

/** Mock gateway: user pressed "Pay" on the fake sheet. */
export async function mockPay(orderId: string, userId: string) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId }, include: { booking: true } });
  if (!payment || payment.provider !== 'MOCK') throw notFound('Order');
  if (payment.booking.userId !== userId) throw forbidden();
  const paymentId = mockProvider.newPaymentId();
  return confirmPayment({
    userId,
    providerOrderId: orderId,
    providerPaymentId: paymentId,
    signature: mockProvider.sign(orderId, paymentId),
  });
}

/** Mock gateway: user pressed "Fail". The hold stays, so they can retry. */
export async function mockFail(orderId: string, userId: string) {
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: orderId }, include: { booking: true } });
  if (!payment || payment.provider !== 'MOCK') throw notFound('Order');
  if (payment.booking.userId !== userId) throw forbidden();
  await markFailed(payment.bookingId, payment.id);
  return { bookingId: payment.bookingId, status: 'FAILED' as const };
}

async function markFailed(bookingId: string, paymentId: string) {
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
  if (booking.status !== 'PENDING') return;
  await prisma.$transaction([
    prisma.payment.update({ where: { id: paymentId }, data: { status: 'FAILED' } }),
    prisma.booking.update({ where: { id: bookingId }, data: { status: 'FAILED' } }),
  ]);
  if (booking.groupRoomId) await onMemberPaymentFailed(booking.groupRoomId, booking.userId);
}

/** Razorpay webhook (server-to-server). */
export async function handleRazorpayWebhook(rawBody: Buffer, signature: string | undefined) {
  const provider = providerByName('RAZORPAY');
  if (!provider.verifyWebhook(rawBody, signature)) throw new AppError(400, 'INVALID_SIGNATURE', 'Bad webhook signature');
  const event = JSON.parse(rawBody.toString('utf8')) as {
    event: string;
    payload?: { payment?: { entity?: { id: string; order_id: string } } };
  };
  const entity = event.payload?.payment?.entity;
  if (!entity) return { ignored: true };
  const payment = await prisma.payment.findUnique({ where: { providerOrderId: entity.order_id } });
  if (!payment) return { ignored: true };
  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    await finalizeBooking(payment.bookingId, entity.id).catch((err) => {
      logger.warn({ err: err.message, bookingId: payment.bookingId }, 'webhook finalize failed');
    });
  } else if (event.event === 'payment.failed') {
    await markFailed(payment.bookingId, payment.id);
  }
  return { ok: true };
}

/**
 * Turns a PENDING booking into CONFIRMED. This is where double booking is made impossible:
 *  1. booking row + seat rows are locked with SELECT ... FOR UPDATE (serialises competitors)
 *  2. the Redis hold must still belong to this booking
 *  3. BookingSeat has UNIQUE(showId, seatId) — the database itself rejects a duplicate
 * Idempotent: confirming twice returns the same result.
 */
export async function finalizeBooking(bookingId: string, providerPaymentId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!booking) throw notFound('Booking');
  if (booking.status === 'CONFIRMED') return { bookingId, status: 'CONFIRMED' as const };
  const payment = booking.payments[0];
  if (!payment) throw notFound('Payment');

  const seatIds = [...booking.heldSeatIds].sort();
  const show = await prisma.show.findUniqueOrThrow({ where: { id: booking.showId } });
  const seats = (await venueSeats(show.venueId)).filter((s) => seatIds.includes(s.id));

  try {
    await prisma.$transaction(
      async (tx) => {
        const [locked] = await tx.$queryRaw<{ status: string }[]>`
          SELECT status FROM "Booking" WHERE id = ${bookingId} FOR UPDATE`;
        if (locked?.status === 'CONFIRMED') return;
        if (locked?.status !== 'PENDING' && locked?.status !== 'FAILED') {
          throw conflict('BOOKING_CLOSED', 'This booking can no longer be paid');
        }
        await tx.$queryRaw`SELECT id FROM "Seat" WHERE id IN (${Prisma.join(seatIds)}) ORDER BY id FOR UPDATE`;

        const owners = await seatOwners(booking.showId, seatIds);
        if (owners.some((o) => o !== booking.holdId)) {
          throw conflict('HOLD_EXPIRED', 'Your seat hold expired before the payment completed');
        }

        const created = await tx.bookingSeat.createManyAndReturn({
          data: seats.map((s) => ({ bookingId, showId: booking.showId, seatId: s.id, price: tierPrice(show, s.tier) })),
        });
        const qrToken = signTicketToken(bookingId);
        await tx.ticket.createMany({ data: created.map((bs) => ({ bookingSeatId: bs.id, qrToken })) });
        await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } });
        await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID', providerPaymentId } });
      },
      { timeout: 15_000 },
    );
  } catch (err) {
    const seatTaken = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    const holdExpired = err instanceof AppError && err.code === 'HOLD_EXPIRED';
    if (seatTaken || holdExpired) {
      // The customer paid but could not get the seats: fail the booking and refund automatically.
      await prisma.$transaction([
        prisma.booking.update({ where: { id: bookingId }, data: { status: 'FAILED' } }),
        prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', providerPaymentId } }),
      ]);
      await providerByName(payment.provider).refund(providerPaymentId, payment.amount);
      if (booking.groupRoomId) await onMemberPaymentFailed(booking.groupRoomId, booking.userId);
      throw conflict(
        seatTaken ? 'SEAT_TAKEN' : 'HOLD_EXPIRED',
        seatTaken
          ? 'Those seats were booked by someone else. Your payment has been refunded.'
          : 'Your hold expired before payment completed. Your payment has been refunded.',
      );
    }
    throw err;
  }

  if (booking.holdId) await consumeSeats(booking.holdId, booking.showId, seatIds);
  await broadcastSeats(booking.showId, seatIds);
  await incrMetric('bookings_confirmed');
  audit(booking.userId, 'booking.confirmed', 'Booking', bookingId, { seats: seatIds.length, total: booking.total });
  await enqueueEmail('booking-confirmed', { bookingId }).catch(() => undefined);
  if (booking.groupRoomId) await onMemberPaid(booking.groupRoomId, booking.userId);
  return { bookingId, status: 'CONFIRMED' as const };
}
