import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { keys, redis } from '../src/lib/redis.js';
import { prisma } from '../src/lib/prisma.js';
import { http, makeShow, makeUser, resetAll } from './helpers.js';

describe('seat locking', () => {
  beforeEach(resetAll);
  afterAll(() => prisma.$disconnect());

  it('is all-or-nothing and rejects seats already locked by someone else', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const b = await makeUser();

    const lockA = await http().post(`/api/v1/shows/${show.id}/holds`).set(a.auth).send({ seatIds: [seats[0].id] });
    expect(lockA.status).toBe(201);

    // B asks for a free seat AND A's seat: must fail entirely.
    const lockB = await http()
      .post(`/api/v1/shows/${show.id}/holds`)
      .set(b.auth)
      .send({ seatIds: [seats[1].id, seats[0].id] });
    expect(lockB.status).toBe(409);
    expect(lockB.body.error.code).toBe('SEAT_TAKEN');
    expect(await redis.get(keys.seat(show.id, seats[1].id))).toBeNull();

    const state = await http().get(`/api/v1/shows/${show.id}/seats`);
    expect(state.body.data.states[seats[0].id].status).toBe('HELD');
    expect(state.body.data.states[seats[1].id]).toBeUndefined();
  });

  it('50 parallel requests for the same seat → exactly 1 succeeds', async () => {
    const { show, seats } = await makeShow();
    const users = await Promise.all(Array.from({ length: 50 }, () => makeUser()));
    const results = await Promise.all(
      users.map((u) => http().post(`/api/v1/shows/${show.id}/holds`).set(u.auth).send({ seatIds: [seats[5].id] })),
    );
    const ok = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(1);
    expect(conflicts).toHaveLength(49);
  });

  it('caps seats per user and lets the owner release', async () => {
    const { show, seats } = await makeShow();
    const a = await makeUser();
    const first = await http()
      .post(`/api/v1/shows/${show.id}/holds`)
      .set(a.auth)
      .send({ seatIds: seats.slice(0, 8).map((s) => s.id) });
    expect(first.status).toBe(201);
    const tooMany = await http().post(`/api/v1/shows/${show.id}/holds`).set(a.auth).send({ seatIds: [seats[8].id] });
    expect(tooMany.status).toBe(400);

    const holdId = first.body.data.holdId as string;
    const other = await makeUser();
    expect((await http().delete(`/api/v1/holds/${holdId}`).set(other.auth)).status).toBe(403);
    const release = await http().delete(`/api/v1/holds/${holdId}`).set(a.auth);
    expect(release.status).toBe(200);
    expect(release.body.data.released).toHaveLength(8);
    expect(await redis.get(keys.seat(show.id, seats[0].id))).toBeNull();
  });
});
