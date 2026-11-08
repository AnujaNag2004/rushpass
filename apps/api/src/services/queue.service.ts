import type { QueueStatusDTO } from '@rushpass/shared';
import { ADMISSION_TTL_SEC, SOCKET } from '@rushpass/shared';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { signAdmissionToken } from '../lib/jwt.js';
import { logger } from '../lib/logger.js';
import { incrMetric } from '../lib/metrics.js';
import { prisma } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { emitTo, rooms } from '../lib/socket.js';

/** Admitter runs every TICK_MS; each tick admits admitPerMinute / ticksPerMinute users. */
export const TICK_MS = 5000;

async function findShow(showId: string) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    select: { id: true, isDrop: true, saleOpensAt: true, admitPerMinute: true, startsAt: true },
  });
  if (!show) throw notFound('Show');
  return show;
}

export async function isAdmitted(showId: string, userId: string) {
  return (await redis.exists(keys.admit(showId, userId))) === 1;
}

/** Throws unless the user may pick seats for this show right now. */
export async function assertCanPickSeats(showId: string, userId: string) {
  const show = await findShow(showId);
  if (show.startsAt.getTime() < Date.now()) throw badRequest('This show has already started');
  if (show.saleOpensAt && show.saleOpensAt.getTime() > Date.now()) {
    throw badRequest('Sales for this show have not opened yet');
  }
  if (show.isDrop && !(await isAdmitted(showId, userId))) {
    throw new AppError(403, 'NOT_ADMITTED', 'Join the waiting room first — this is a drop');
  }
}

export async function joinQueue(showId: string, userId: string): Promise<QueueStatusDTO> {
  const show = await findShow(showId);
  if (!show.isDrop || !show.saleOpensAt) throw badRequest('This show does not use a waiting room');
  if (await isAdmitted(showId, userId)) return getStatus(showId, userId);

  const now = Date.now();
  const opens = show.saleOpensAt.getTime();
  // Everyone who arrives before the sale opens is shuffled fairly within the first minute;
  // later arrivals always queue behind them in arrival order.
  const score = now < opens ? opens + Math.floor(Math.random() * 60_000) : now + 60_000;
  await redis.zadd(keys.queue(showId), 'NX', score, userId); // NX = one spot per account
  return getStatus(showId, userId);
}

export async function getStatus(showId: string, userId: string): Promise<QueueStatusDTO> {
  const show = await findShow(showId);
  const qKey = keys.queue(showId);
  const [token, ttl, rank, total] = await Promise.all([
    redis.get(keys.admit(showId, userId)),
    redis.pttl(keys.admit(showId, userId)),
    redis.zrank(qKey, userId),
    redis.zcard(qKey),
  ]);
  const saleOpen = !show.saleOpensAt || show.saleOpensAt.getTime() <= Date.now();
  const ahead = rank ?? 0;
  const untilOpen = show.saleOpensAt ? Math.max(0, (show.saleOpensAt.getTime() - Date.now()) / 1000) : 0;
  return {
    showId,
    saleOpensAt: show.saleOpensAt?.toISOString() ?? null,
    saleOpen,
    inQueue: rank !== null,
    position: rank !== null ? rank + 1 : null,
    ahead,
    behind: rank !== null ? Math.max(0, total - rank - 1) : 0,
    total,
    admitted: !!token,
    admissionToken: token,
    admissionExpiresAt: token && ttl > 0 ? Date.now() + ttl : null,
    estimatedWaitSec: rank !== null ? Math.ceil(untilOpen + ((rank + 1) / show.admitPerMinute) * 60) : null,
    admitPerMinute: show.admitPerMinute,
  };
}

export function perTick(admitPerMinute: number) {
  return Math.max(1, Math.round((admitPerMinute * TICK_MS) / 60_000));
}

/** Admits the next batch of users for one show. Returns the admitted user ids. */
export async function admitBatch(showId: string, count: number) {
  const popped = await redis.zpopmin(keys.queue(showId), count);
  const userIds: string[] = [];
  for (let i = 0; i < popped.length; i += 2) userIds.push(popped[i]);
  if (!userIds.length) return userIds;

  const pipe = redis.pipeline();
  const tokens = userIds.map((uid) => signAdmissionToken(showId, uid));
  userIds.forEach((uid, i) => pipe.set(keys.admit(showId, uid), tokens[i], 'EX', ADMISSION_TTL_SEC));
  pipe.incrby(keys.admittedCount(showId), userIds.length);
  await pipe.exec();
  await incrMetric('admitted_total', userIds.length);

  const expiresAt = Date.now() + ADMISSION_TTL_SEC * 1000;
  userIds.forEach((uid, i) => emitTo(rooms.user(uid), SOCKET.QUEUE_ADMITTED, { showId, token: tokens[i], expiresAt }));
  return userIds;
}

/** One admitter tick across every open drop. */
export async function admitTick() {
  const now = new Date();
  const drops = await prisma.show.findMany({
    where: { isDrop: true, saleOpensAt: { lte: now }, startsAt: { gt: now } },
    select: { id: true, admitPerMinute: true },
  });
  for (const show of drops) {
    try {
      const admitted = await admitBatch(show.id, perTick(show.admitPerMinute));
      const [total, admittedTotal] = await Promise.all([
        redis.zcard(keys.queue(show.id)),
        redis.get(keys.admittedCount(show.id)),
      ]);
      emitTo(rooms.queue(show.id), SOCKET.QUEUE_TICK, {
        showId: show.id,
        total,
        admittedTotal: Number(admittedTotal ?? 0),
        admittedNow: admitted.length,
      });
    } catch (err) {
      logger.error({ err, showId: show.id }, 'admitter tick failed');
    }
  }
}

export async function queueStats(showId: string) {
  const [total, admitted] = await Promise.all([
    redis.zcard(keys.queue(showId)),
    redis.get(keys.admittedCount(showId)),
  ]);
  return { queueLength: total, admitted: Number(admitted ?? 0) };
}
