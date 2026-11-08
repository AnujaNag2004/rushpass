import { Prisma } from '@prisma/client';
import type { RushMonitorDTO, Role } from '@rushpass/shared';
import { audit } from '../lib/audit.js';
import { forbidden, notFound } from '../lib/errors.js';
import type { AccessPayload } from '../lib/jwt.js';
import { readMetrics } from '../lib/metrics.js';
import { prisma } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { getIO } from '../lib/socket.js';
import { getShowSeats } from './seatState.service.js';
import { toUserDTO } from './dto.js';

interface DayRow {
  day: Date;
  revenue: bigint | number | null;
  bookings: bigint | number;
}

const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

function fillDays(rows: DayRow[], days: number) {
  const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const out: { day: string; revenue: number; bookings: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const r = map.get(d);
    out.push({ day: d, revenue: num(r?.revenue), bookings: num(r?.bookings) });
  }
  return out;
}

export async function organizerStats(user: AccessPayload) {
  const scope = user.role === 'ADMIN' ? Prisma.sql`TRUE` : Prisma.sql`e."organizerId" = ${user.sub}`;
  const eventWhere = user.role === 'ADMIN' ? {} : { organizerId: user.sub };

  const [events, upcomingShows, revenueAgg, ticketsSold, byDay, tiers, topEvents] = await Promise.all([
    prisma.event.count({ where: eventWhere }),
    prisma.show.count({ where: { event: eventWhere, startsAt: { gt: new Date() } } }),
    prisma.booking.aggregate({ where: { status: 'CONFIRMED', show: { event: eventWhere } }, _sum: { total: true } }),
    prisma.bookingSeat.count({ where: { show: { event: eventWhere } } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', b."createdAt") AS day, SUM(b.total) AS revenue, COUNT(*) AS bookings
      FROM "Booking" b JOIN "Show" s ON s.id = b."showId" JOIN "Event" e ON e.id = s."eventId"
      WHERE b.status = 'CONFIRMED' AND b."createdAt" > NOW() - INTERVAL '14 days' AND ${scope}
      GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ tier: string; sold: bigint; revenue: bigint }[]>`
      SELECT st.tier::text AS tier, COUNT(*) AS sold, SUM(bs.price) AS revenue
      FROM "BookingSeat" bs JOIN "Seat" st ON st.id = bs."seatId"
      JOIN "Show" s ON s.id = bs."showId" JOIN "Event" e ON e.id = s."eventId"
      WHERE ${scope} GROUP BY 1`,
    prisma.$queryRaw<{ id: string; title: string; slug: string; sold: bigint; revenue: bigint }[]>`
      SELECT e.id, e.title, e.slug, COUNT(bs.id) AS sold, COALESCE(SUM(bs.price), 0) AS revenue
      FROM "Event" e JOIN "Show" s ON s."eventId" = e.id LEFT JOIN "BookingSeat" bs ON bs."showId" = s.id
      WHERE ${scope} GROUP BY e.id ORDER BY revenue DESC LIMIT 5`,
  ]);

  return {
    events,
    upcomingShows,
    revenue: revenueAgg._sum.total ?? 0,
    ticketsSold,
    salesByDay: fillDays(byDay, 14),
    tiers: ['REGULAR', 'PREMIUM', 'VIP'].map((tier) => {
      const t = tiers.find((r) => r.tier === tier);
      return { tier, sold: num(t?.sold), revenue: num(t?.revenue) };
    }),
    topEvents: topEvents.map((e) => ({ ...e, sold: num(e.sold), revenue: num(e.revenue) })),
  };
}

export async function showOccupancy(showId: string, user: AccessPayload) {
  const show = await prisma.show.findUnique({ where: { id: showId }, include: { event: true } });
  if (!show) throw notFound('Show');
  if (user.role !== 'ADMIN' && show.event.organizerId !== user.sub) throw forbidden();
  const seats = await getShowSeats(showId);
  const tiers = (['REGULAR', 'PREMIUM', 'VIP'] as const).map((tier) => {
    const ofTier = seats.seats.filter((s) => s.tier === tier);
    return {
      tier,
      total: ofTier.length,
      booked: ofTier.filter((s) => seats.states[s.id]?.status === 'BOOKED').length,
      held: ofTier.filter((s) => seats.states[s.id]?.status === 'HELD').length,
    };
  });
  const revenue = await prisma.booking.aggregate({ where: { showId, status: 'CONFIRMED' }, _sum: { total: true } });
  return { ...seats, tiers, revenue: revenue._sum.total ?? 0 };
}

export async function adminStats() {
  const [users, events, bookings, revenue, byDay, byRole, recent] = await Promise.all([
    prisma.user.count(),
    prisma.event.count(),
    prisma.booking.count({ where: { status: 'CONFIRMED' } }),
    prisma.booking.aggregate({ where: { status: 'CONFIRMED' }, _sum: { total: true } }),
    prisma.$queryRaw<DayRow[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM(total) AS revenue, COUNT(*) AS bookings
      FROM "Booking" WHERE status = 'CONFIRMED' AND "createdAt" > NOW() - INTERVAL '14 days'
      GROUP BY 1 ORDER BY 1`,
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.booking.findMany({
      where: { status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: true, show: { include: { event: true } }, _count: { select: { seats: true } } },
    }),
  ]);
  return {
    users,
    events,
    bookings,
    revenue: revenue._sum.total ?? 0,
    salesByDay: fillDays(byDay, 14),
    usersByRole: byRole.map((r) => ({ role: r.role, count: r._count })),
    recentBookings: recent.map((b) => ({
      id: b.id,
      user: b.user.name,
      event: b.show.event.title,
      seats: b._count.seats,
      total: b.total,
      createdAt: b.createdAt.toISOString(),
    })),
  };
}

export async function listUsers(q: string | undefined, page: number, pageSize: number) {
  const where: Prisma.UserWhereInput = q
    ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { bookings: true } } },
    }),
    prisma.user.count({ where }),
  ]);
  return {
    data: rows.map((u) => ({ ...toUserDTO(u), createdAt: u.createdAt.toISOString(), bookings: u._count.bookings })),
    meta: { page, pageSize, total },
  };
}

export async function changeRole(userId: string, role: Role, actor: AccessPayload) {
  const user = await prisma.user.update({ where: { id: userId }, data: { role } });
  audit(actor.sub, 'user.role', 'User', userId, { role });
  return toUserDTO(user);
}

async function countKeys(pattern: string) {
  let cursor = '0';
  let count = 0;
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
    cursor = next;
    count += batch.length;
  } while (cursor !== '0');
  return count;
}

export async function rushMonitor(): Promise<RushMonitorDTO> {
  const io = getIO();
  const drops = await prisma.show.findMany({ where: { isDrop: true, startsAt: { gt: new Date() } }, select: { id: true } });
  const [metrics, seatsLocked, queueLengths, dup, sockets] = await Promise.all([
    readMetrics(),
    countKeys('seat:*'),
    Promise.all(drops.map((d) => redis.zcard(keys.queue(d.id)))),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM (
        SELECT "showId", "seatId" FROM "BookingSeat" GROUP BY 1, 2 HAVING COUNT(*) > 1
      ) d`,
    io ? io.fetchSockets().then((s) => s.length) : Promise.resolve(0),
  ]);
  return {
    activeSockets: sockets,
    queueLength: queueLengths.reduce((a, b) => a + b, 0),
    admittedTotal: metrics.admitted_total,
    seatsLocked,
    locksOk: metrics.locks_ok,
    lockConflicts: metrics.locks_conflict,
    bookingsConfirmed: metrics.bookings_confirmed,
    doubleBookings: num(dup[0]?.count),
    at: Date.now(),
  };
}
