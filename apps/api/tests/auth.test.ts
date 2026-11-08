import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { http, resetAll } from './helpers.js';

const cookieOf = (res: { headers: Record<string, unknown> }) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith('rp_refresh='))!.split(';')[0];

describe('auth flow', () => {
  beforeEach(resetAll);
  afterAll(() => prisma.$disconnect());

  it('registers, reads /me, refreshes with rotation, and rejects token reuse', async () => {
    const reg = await http()
      .post('/api/v1/auth/register')
      .send({ name: 'Aarav', email: 'AARAV@test.dev', password: 'Password@123' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.email).toBe('aarav@test.dev');
    const cookie1 = cookieOf(reg);

    const me = await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${reg.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.name).toBe('Aarav');

    const refreshed = await http().post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeTruthy();

    // The first refresh token was rotated out; replaying it must fail.
    const replay = await http().post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(replay.status).toBe(401);
  });

  it('rejects duplicate emails, weak passwords and wrong credentials', async () => {
    await http().post('/api/v1/auth/register').send({ name: 'Meera', email: 'm@test.dev', password: 'Password@123' });
    const dup = await http().post('/api/v1/auth/register').send({ name: 'Meera', email: 'm@test.dev', password: 'Password@123' });
    expect(dup.status).toBe(409);

    const weak = await http().post('/api/v1/auth/register').send({ name: 'Weak', email: 'w@test.dev', password: 'short' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');

    const bad = await http().post('/api/v1/auth/login').send({ email: 'm@test.dev', password: 'Nope12345' });
    expect(bad.status).toBe(401);

    const ok = await http().post('/api/v1/auth/login').send({ email: 'm@test.dev', password: 'Password@123' });
    expect(ok.status).toBe(200);
  });

  it('protects routes', async () => {
    const res = await http().get('/api/v1/bookings/me');
    expect(res.status).toBe(401);
  });
});
