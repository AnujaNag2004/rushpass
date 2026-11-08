import crypto from 'node:crypto';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { generateSeats, type VenueLayout } from '@rushpass/shared';
import { createApp } from '../src/app.js';
import { signAccessToken } from '../src/lib/jwt.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

export const app = createApp();
export const http = () => request(app);

export async function resetAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  await redis.flushdb();
}

export async function makeUser(role: Role = 'USER', name = 'Test User') {
  const user = await prisma.user.create({
    data: { name, email: `${crypto.randomUUID()}@test.dev`, passwordHash: 'x', role },
  });
  const token = signAccessToken({ sub: user.id, role: user.role, name: user.name });
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

const SMALL_LAYOUT: VenueLayout = {
  sections: [
    {
      name: 'Floor',
      rows: [
        { label: 'A', seats: 10, tier: 'VIP', gapsAfter: [] },
        { label: 'B', seats: 10, tier: 'REGULAR', gapsAfter: [5] },
      ],
    },
  ],
};

export async function makeShow(opts: { isDrop?: boolean; saleOpensAt?: Date | null; admitPerMinute?: number } = {}) {
  const { user: organizer } = await makeUser('ORGANIZER', 'Org');
  const venue = await prisma.venue.create({
    data: {
      name: 'Test Hall',
      city: 'Pune',
      address: '1 Test Road',
      organizerId: organizer.id,
      layoutJson: SMALL_LAYOUT,
      seats: { create: generateSeats(SMALL_LAYOUT) },
    },
    include: { seats: { orderBy: [{ y: 'asc' }, { x: 'asc' }] } },
  });
  const event = await prisma.event.create({
    data: {
      title: 'Test Event',
      slug: `test-${crypto.randomUUID().slice(0, 8)}`,
      description: 'A test event description',
      category: 'CONCERT',
      bannerUrl: 'https://example.com/a.jpg',
      organizerId: organizer.id,
      status: 'PUBLISHED',
    },
  });
  const show = await prisma.show.create({
    data: {
      eventId: event.id,
      venueId: venue.id,
      startsAt: new Date(Date.now() + 10 * 86_400_000),
      priceRegular: 50_000,
      pricePremium: 80_000,
      priceVip: 120_000,
      isDrop: opts.isDrop ?? false,
      saleOpensAt: opts.saleOpensAt ?? null,
      admitPerMinute: opts.admitPerMinute ?? 60,
    },
  });
  return { show, venue, seats: venue.seats, event, organizer };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
