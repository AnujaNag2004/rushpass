import type { Prisma } from '@prisma/client';
import type { BookingDTO } from '@rushpass/shared';
import { CANCEL_CUTOFF_MS, seatLabel } from '@rushpass/shared';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { AccessPayload } from '../lib/jwt.js';
import { providerByName } from '../lib/payments/index.js';
import { prisma } from '../lib/prisma.js';
import { qrDataUrl, ticketPdf } from '../lib/tickets.js';
import { enqueueEmail } from '../jobs/scheduler.js';
import { readHold } from './holds.service.js';
import { broadcastSeats, venueSeats } from './seatState.service.js';
import { toSeatDTO, toShowDTO } from './dto.js';

const bookingInclude = {
  show: { include: { venue: { include: { _count: { select: { seats: true } } } }, event: true } },
  seats: { include: { seat: true, ticket: true }, orderBy: { seat: { number: 'asc' } } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  groupRoom: { select: { code: true } },
  user: true,
} satisfies Prisma.BookingInclude;

type FullBooking = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

async function toBookingDTO(b: FullBooking, withQr = false): Promise<BookingDTO> {
  const token = b.seats[0]?.ticket?.qrToken;
  const heldSeats =
    b.status !== 'CONFIRMED'
      ?(await venueSeats(b.show.venueId)).filter((s) => b.heldSeatIds.includes(s.id)).map(toSeatDTO)
      : undefined;
  const payment = b.payments[0];
  let holdExpiresAt: number | null = null;
  if (b.status === 'PENDING' && b.holdId) {
    const hold = await readHold(b.holdId);
    holdExpiresAt = hold ? hold.expiresAt : null;
    if (hold?.kind === 'GROUP' && b.groupRoomId) {
      const room = await prisma.groupRoom.findUnique({ where: { id: b.groupRoomId }, select: { expiresAt: true } });
      holdExpiresAt = room?.expiresAt?.getTime() ?? holdExpiresAt;
    }
  }
  return {
    id: b.id,
    status: b.status,
    holdId: b.holdId,
    holdExpiresAt,
    subtotal: b.subtotal,
    fees: b.fees,
    tax: b.tax,
    total: b.total,
    createdAt: b.createdAt.toISOString(),
    groupCode: b.groupRoom?.code ?? null,
    show: {
      ...toShowDTO(b.show),
      event: {
        id: b.show.event.id,
        title: b.show.event.title,
        slug: b.show.event.slug,
        bannerUrl: b.show.event.bannerUrl,
        category: b.show.event.category,
      },
    },
    tickets: b.seats.map((bs) => ({
      id: bs.ticket?.id ?? bs.id,
      seat: toSeatDTO(bs.seat),
      price: bs.price,
      checkedInAt: bs.ticket?.checkedInAt?.toISOString() ?? null,
    })),
    heldSeats,
    qrDataUrl: withQr && token && b.status === 'CONFIRMED' ? await qrDataUrl(token) : null,
    payment: payment ? { provider: payment.provider, status: payment.status, orderId: payment.providerOrderId } : null,
  };
}

async function loadOwned(id: string, user: AccessPayload) {
  const booking = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!booking) throw notFound('Booking');
  if (booking.userId !== user.sub && user.role !== 'ADMIN') throw forbidden();
  return booking;
}

export async function listMine(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { userId, status: { in: ['CONFIRMED', 'CANCELLED'] } },
    include: bookingInclude,
    orderBy: { show: { startsAt: 'asc' } },
  });
  return Promise.all(bookings.map((b) => toBookingDTO(b)));
}

export async function getBooking(id: string, user: AccessPayload) {
  return toBookingDTO(await loadOwned(id, user), true);
}

export async function cancelBooking(id: string, user: AccessPayload) {
  const booking = await loadOwned(id, user);
  if (booking.status !== 'CONFIRMED') throw badRequest('Only confirmed bookings can be cancelled');
  if (booking.show.startsAt.getTime() - Date.now() < CANCEL_CUTOFF_MS) {
    throw badRequest('Bookings can only be cancelled more than 24 hours before the show');
  }
  if (booking.seats.some((s) => s.ticket?.checkedInAt)) throw badRequest('Tickets were already used');

  const seatIds = booking.seats.map((s) => s.seatId);
  const payment = booking.payments[0];
  await prisma.$transaction([
    prisma.bookingSeat.deleteMany({ where: { bookingId: id } }), // frees the seats (tickets cascade)
    prisma.booking.update({ where: { id }, data: { status: 'CANCELLED', heldSeatIds: seatIds } }),
    ...(payment ? [prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })] : []),
  ]);
  if (payment?.providerPaymentId) await providerByName(payment.provider).refund(payment.providerPaymentId, payment.amount);
  await broadcastSeats(booking.showId, seatIds);
  audit(user.sub, 'booking.cancelled', 'Booking', id, { seats: seatIds.length });
  await enqueueEmail('booking-cancelled', { bookingId: id }).catch(() => undefined);
  return getBooking(id, user);
}

export async function bookingPdf(id: string, user: AccessPayload) {
  const b = await loadOwned(id, user);
  if (b.status !== 'CONFIRMED') throw badRequest('Tickets are only available for confirmed bookings');
  return renderPdf(b);
}

export async function renderPdfById(id: string) {
  const b = await prisma.booking.findUnique({ where: { id }, include: bookingInclude });
  if (!b) throw notFound('Booking');
  return { booking: b, pdf: await renderPdf(b) };
}

function renderPdf(b: FullBooking) {
  return ticketPdf({
    bookingId: b.id,
    eventTitle: b.show.event.title,
    venue: b.show.venue.name,
    city: b.show.venue.city,
    startsAt: b.show.startsAt,
    holderName: b.user.name,
    seats: b.seats.map((s) => ({ label: seatLabel(s.seat), section: s.seat.section, tier: s.seat.tier })),
    total: b.total,
    qrToken: b.seats[0]?.ticket?.qrToken ?? b.id,
  });
}
