import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { expireRoom } from '../src/services/groups.service.js';
import { http, makeShow, makeUser, resetAll } from './helpers.js';

describe('group booking room', () => {
  beforeEach(resetAll);
  afterAll(() => prisma.$disconnect());

  it('split payment: paid members keep tickets, unpaid seats are released on expiry', async () => {
    const { show, seats } = await makeShow();
    const host = await makeUser('USER', 'Host');
    const friend = await makeUser('USER', 'Friend');

    const created = await http().post('/api/v1/groups').set(host.auth).send({ showId: show.id });
    expect(created.status).toBe(201);
    const code = created.body.data.code as string;
    expect(code).toHaveLength(6);

    const joined = await http().post(`/api/v1/groups/${code}/join`).set(friend.auth);
    expect(joined.body.data.members).toHaveLength(2);

    expect(
      (await http().post(`/api/v1/shows/${show.id}/holds`).set(host.auth).send({ seatIds: [seats[0].id], groupCode: code }))
        .status,
    ).toBe(201);
    expect(
      (await http().post(`/api/v1/shows/${show.id}/holds`).set(friend.auth).send({ seatIds: [seats[1].id], groupCode: code }))
        .status,
    ).toBe(201);
    // A friend's seat cannot be picked by another member.
    const clash = await http()
      .post(`/api/v1/shows/${show.id}/holds`)
      .set(friend.auth)
      .send({ seatIds: [seats[0].id], groupCode: code });
    expect(clash.status).toBe(409);

    // Only the host can lock in.
    expect((await http().post(`/api/v1/groups/${code}/lockin`).set(friend.auth)).status).toBe(403);
    const locked = await http().post(`/api/v1/groups/${code}/lockin`).set(host.auth);
    expect(locked.body.data.status).toBe('PAYING');

    const order = await http().post('/api/v1/checkout/orders').set(host.auth).send({ groupCode: code });
    expect(order.status).toBe(201);
    expect(order.body.data.amount).toBeGreaterThan(0);
    const paid = await http().post(`/api/v1/checkout/mock/${order.body.data.orderId}/pay`).set(host.auth);
    expect(paid.body.data.status).toBe('CONFIRMED');

    // Friend never pays; the timer runs out.
    await prisma.groupRoom.update({ where: { code }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireRoom(code);

    const state = await http().get(`/api/v1/groups/${code}`).set(host.auth);
    expect(state.body.data.status).toBe('COMPLETED');
    const members = state.body.data.members as { userId: string; paymentStatus: string }[];
    expect(members.find((m) => m.userId === host.user.id)?.paymentStatus).toBe('PAID');
    expect(members.find((m) => m.userId === friend.user.id)?.paymentStatus).toBe('FAILED');

    const seatMap = await http().get(`/api/v1/shows/${show.id}/seats`);
    expect(seatMap.body.data.states[seats[0].id].status).toBe('BOOKED');
    expect(seatMap.body.data.states[seats[1].id]).toBeUndefined();
  });

  it('limits extension to once and lets the host kick unpaid members', async () => {
    const { show, seats } = await makeShow();
    const host = await makeUser('USER', 'Host');
    const friend = await makeUser('USER', 'Friend');
    const code = (await http().post('/api/v1/groups').set(host.auth).send({ showId: show.id })).body.data.code;
    await http().post(`/api/v1/groups/${code}/join`).set(friend.auth);
    await http().post(`/api/v1/shows/${show.id}/holds`).set(friend.auth).send({ seatIds: [seats[2].id], groupCode: code });

    const ext = await http().post(`/api/v1/groups/${code}/extend`).set(host.auth);
    expect(ext.status).toBe(200);
    expect(ext.body.data.extended).toBe(true);
    expect((await http().post(`/api/v1/groups/${code}/extend`).set(host.auth)).status).toBe(400);

    const kicked = await http().delete(`/api/v1/groups/${code}/members/${friend.user.id}`).set(host.auth);
    expect(kicked.body.data.members).toHaveLength(1);
    const seatMap = await http().get(`/api/v1/shows/${show.id}/seats`);
    expect(seatMap.body.data.states[seats[2].id]).toBeUndefined();
  });
});
