import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { admitBatch } from '../src/services/queue.service.js';
import { http, makeShow, makeUser, resetAll, sleep } from './helpers.js';

describe('fair waiting room', () => {
  beforeEach(resetAll);
  afterAll(() => prisma.$disconnect());

  it('admits users in queue order and gates seat locking behind admission', async () => {
    const { show, seats } = await makeShow({ isDrop: true, saleOpensAt: new Date(Date.now() - 60_000) });
    const users = await Promise.all(Array.from({ length: 5 }, (_, i) => makeUser('USER', `U${i}`)));

    for (const u of users) {
      const res = await http().post(`/api/v1/shows/${show.id}/queue/join`).set(u.auth);
      expect(res.status).toBe(200);
      await sleep(3);
    }
    // Joining twice keeps the same spot.
    const again = await http().post(`/api/v1/shows/${show.id}/queue/join`).set(users[0].auth);
    expect(again.body.data.position).toBe(1);

    const blocked = await http().post(`/api/v1/shows/${show.id}/holds`).set(users[0].auth).send({ seatIds: [seats[0].id] });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('NOT_ADMITTED');

    const admitted = await admitBatch(show.id, 2);
    expect(admitted).toEqual([users[0].user.id, users[1].user.id]);

    const status = await http().get(`/api/v1/shows/${show.id}/queue/status`).set(users[2].auth);
    expect(status.body.data.position).toBe(1);
    expect(status.body.data.behind).toBe(2);
    expect(status.body.data.admitted).toBe(false);

    const me = await http().get(`/api/v1/shows/${show.id}/queue/status`).set(users[0].auth);
    expect(me.body.data.admitted).toBe(true);
    expect(me.body.data.admissionToken).toBeTruthy();

    const allowed = await http().post(`/api/v1/shows/${show.id}/holds`).set(users[0].auth).send({ seatIds: [seats[0].id] });
    expect(allowed.status).toBe(201);
  });

  it('blocks seat picking before the sale opens', async () => {
    const { show, seats } = await makeShow({ isDrop: true, saleOpensAt: new Date(Date.now() + 60_000) });
    const u = await makeUser();
    const join = await http().post(`/api/v1/shows/${show.id}/queue/join`).set(u.auth);
    expect(join.body.data.saleOpen).toBe(false);
    expect(join.body.data.inQueue).toBe(true);
    const res = await http().post(`/api/v1/shows/${show.id}/holds`).set(u.auth).send({ seatIds: [seats[0].id] });
    expect(res.status).toBe(400);
  });
});
