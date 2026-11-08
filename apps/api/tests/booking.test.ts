import crypto from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { keys, redis } from '../src/lib/redis.js';
import { finalizeBooking } from '../src/services/checkout.service.js';
import { http, makeShow, makeUser, resetAll } from './helpers.js';

describe('checkout + booking', () => {
  beforeEach(resetAll);
  afterAll(() => prisma.$disconnect());

  it('books end to end with the mock gateway and idempotent order creation', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const lock = await http()
      .post(`/api/v1/shows/${show.id}/holds`)
      .set(a.auth)
      .send({ seatIds: [seats[0].id, seats[15].id] });
    const holdId = lock.body.data.holdId;

    const key = crypto.randomUUID();
    const order1 = await http().post('/api/v1/checkout/orders').set(a.auth).set('Idempotency-Key', key).send({ holdId });
    const order2 = await http().post('/api/v1/checkout/orders').set(a.auth).set('Idempotency-Key', key).send({ holdId });
    expect(order1.status).toBe(201);
    expect(order2.body.data.bookingId).toBe(order1.body.data.bookingId);
    expect(order1.body.data.provider).toBe('MOCK');
    // VIP 1200 + Regular 500 = 1700, fee 5% = 85, GST 18% of fee = 15.30 → paise
    expect(order1.body.data.breakdown).toEqual({ subtotal: 170000, fees: 8500, tax: 1530, total: 180030 });
    expect(await prisma.booking.count()).toBe(1);

    const pay = await http().post(`/api/v1/checkout/mock/${order1.body.data.orderId}/pay`).set(a.auth);
    expect(pay.status).toBe(200);
    expect(pay.body.data.status).toBe('CONFIRMED');

    const booking = await http().get(`/api/v1/bookings/${order1.body.data.bookingId}`).set(a.auth);
    expect(booking.body.data.tickets).toHaveLength(2);
    expect(booking.body.data.qrDataUrl).toMatch(/^data:image\/png/);

    const seatsNow = await http().get(`/api/v1/shows/${show.id}/seats`);
    expect(seatsNow.body.data.states[seats[0].id].status).toBe('BOOKED');

    const b = await makeUser();
    const steal = await http().post(`/api/v1/shows/${show.id}/holds`).set(b.auth).send({ seatIds: [seats[0].id] });
    expect(steal.status).toBe(409);
  });

  it('rejects a forged confirmation signature', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const lock = await http().post(`/api/v1/shows/${show.id}/holds`).set(a.auth).send({ seatIds: [seats[1].id] });
    const order = await http().post('/api/v1/checkout/orders').set(a.auth).send({ holdId: lock.body.data.holdId });
    const forged = await http().post('/api/v1/checkout/confirm').set(a.auth).send({
      bookingId: order.body.data.bookingId,
      providerOrderId: order.body.data.orderId,
      providerPaymentId: 'mock_pay_fake',
      signature: 'deadbeef',
    });
    expect(forged.status).toBe(400);
    expect(forged.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('confirming the same booking 20 times in parallel books the seat exactly once', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const lock = await http().post(`/api/v1/shows/${show.id}/holds`).set(a.auth).send({ seatIds: [seats[2].id] });
    const order = await http().post('/api/v1/checkout/orders').set(a.auth).send({ holdId: lock.body.data.holdId });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => finalizeBooking(order.body.data.bookingId, 'pay_x')),
    );
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await prisma.bookingSeat.count({ where: { showId: show.id } })).toBe(1);
  });

  it('the database unique constraint stops a double booking even if Redis is bypassed', async () => {
    const { show, seats } = await makeShow();
    const users = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    const seat = seats[3];
    const holdId = crypto.randomUUID();
    // Simulate a bug where 10 bookings all believe they own the same seat.
    await redis.set(keys.seat(show.id, seat.id), holdId, 'PX', 60_000);
    const bookings = await Promise.all(
      users.map(({ user }) =>
        prisma.booking.create({
          data: {
            userId: user.id,
            showId: show.id,
            holdId,
            heldSeatIds: [seat.id],
            subtotal: 1,
            fees: 0,
            tax: 0,
            total: 1,
            payments: { create: { provider: 'MOCK', providerOrderId: crypto.randomUUID(), amount: 1 } },
          },
        }),
      ),
    );
    const results = await Promise.allSettled(bookings.map((b) => finalizeBooking(b.id, 'pay')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.bookingSeat.count({ where: { showId: show.id, seatId: seat.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { status: 'REFUNDED' } })).toBe(9);
  });

  it('cancels a booking more than 24h before the show and frees the seat', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const lock = await http().post(`/api/v1/shows/${show.id}/holds`).set(a.auth).send({ seatIds: [seats[4].id] });
    const order = await http().post('/api/v1/checkout/orders').set(a.auth).send({ holdId: lock.body.data.holdId });
    await http().post(`/api/v1/checkout/mock/${order.body.data.orderId}/pay`).set(a.auth);
    const cancel = await http().post(`/api/v1/bookings/${order.body.data.bookingId}/cancel`).set(a.auth);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe('CANCELLED');
    const seatsNow = await http().get(`/api/v1/shows/${show.id}/seats`);
    expect(seatsNow.body.data.states[seats[4].id]).toBeUndefined();
  });
});
