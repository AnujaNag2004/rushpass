import crypto from 'node:crypto';
import type { HoldDTO } from '@rushpass/shared';
import { GROUP_HOLD_MS, MAX_SEATS_PER_USER, SOLO_HOLD_MS, seatLabel, tierPrice } from '@rushpass/shared';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { lockSeatsAtomic, releaseSeatsAtomic } from '../lib/locks.js';
import { incrMetric } from '../lib/metrics.js';
import { prisma } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { scheduleHoldExpiry } from '../jobs/scheduler.js';
import { assertCanPickSeats } from './queue.service.js';
import { broadcastSeats, venueSeats } from './seatState.service.js';
import { toSeatDTO } from './dto.js';

/**
 * Redis layout of a hold
 *   hold:{id}             hash  { showId, userId, kind, groupCode, expiresAt }
 *   holdseats:{id}        hash  { seatId: userId }       (who picked which seat)
 *   seat:{showId}:{seat}  string holdId, PX = time left   (the actual lock)
 *   userhold:{show}:{u}   string holdId                  (solo: one active hold per user per show)
 *   grouphold:{code}      string holdId                  (group: one shared hold per room)
 */
export interface HoldMeta {
  id: string;
  showId: string;
  userId: string;
  kind: 'SOLO' | 'GROUP';
  groupCode?: string;
  expiresAt: number;
}

const GRACE_MS = 60_000;

export async function readHold(holdId: string): Promise<HoldMeta | null> {
  const h = await redis.hgetall(keys.hold(holdId));
  if (!h.showId) return null;
  return {
    id: holdId,
    showId: h.showId,
    userId: h.userId,
    kind: h.kind === 'GROUP' ? 'GROUP' : 'SOLO',
    groupCode: h.groupCode || undefined,
    expiresAt: Number(h.expiresAt),
  };
}

export async function holdSeatMap(holdId: string) {
  return redis.hgetall(keys.holdSeats(holdId));
}

async function writeHold(meta: HoldMeta) {
  const ttl = Math.max(1000, meta.expiresAt - Date.now()) + GRACE_MS;
  const pipe = redis.pipeline();
  pipe.hset(keys.hold(meta.id), {
    showId: meta.showId,
    userId: meta.userId,
    kind: meta.kind,
    groupCode: meta.groupCode ?? '',
    expiresAt: String(meta.expiresAt),
  });
  pipe.pexpire(keys.hold(meta.id), ttl);
  if (meta.kind === 'SOLO') pipe.set(keys.userHold(meta.showId, meta.userId), meta.id, 'PX', ttl);
  else if (meta.groupCode) pipe.set(keys.groupHold(meta.groupCode), meta.id, 'PX', ttl);
  await pipe.exec();
}

/** Changes a hold's deadline (used when a group host extends the timer). */
export async function setHoldExpiry(meta: HoldMeta, expiresAt: number) {
  await writeHold({ ...meta, expiresAt });
  await redis.pexpire(keys.holdSeats(meta.id), Math.max(1000, expiresAt - Date.now()) + GRACE_MS);
}

export async function deleteHold(meta: HoldMeta) {
  const pipe = redis.pipeline();
  pipe.del(keys.hold(meta.id), keys.holdSeats(meta.id));
  await pipe.exec();
  const pointer = meta.kind === 'SOLO' ? keys.userHold(meta.showId, meta.userId) : keys.groupHold(meta.groupCode ?? '');
  if ((await redis.get(pointer)) === meta.id) await redis.del(pointer);
}

async function activeHold(pointerKey: string): Promise<HoldMeta | null> {
  const id = await redis.get(pointerKey);
  if (!id) return null;
  const hold = await readHold(id);
  if (!hold || hold.expiresAt - Date.now() < 1000) return null;
  return hold;
}

export async function findGroupHold(code: string) {
  return activeHold(keys.groupHold(code));
}

export interface LockInput {
  showId: string;
  userId: string;
  seatIds: string[];
  groupCode?: string;
  /** For group holds: whose id the hold is registered under (the host). */
  groupHostId?: string;
}

/**
 * Locks seats for a user. All seats are locked atomically or none are.
 * Returns the hold and whether it was newly created.
 */
export async function lockSeats(input: LockInput): Promise<{ hold: HoldDTO; created: boolean }> {
  const seatIds = [...new Set(input.seatIds)];
  const { showId, userId, groupCode } = input;
  await assertCanPickSeats(showId, userId);

  const show = await prisma.show.findUnique({ where: { id: showId }, select: { venueId: true } });
  if (!show) throw notFound('Show');
  const venueSeatIds = new Set((await venueSeats(show.venueId)).map((s) => s.id));
  if (seatIds.some((id) => !venueSeatIds.has(id))) throw badRequest('One or more seats do not exist in this venue');

  const alreadyBooked = await prisma.bookingSeat.findFirst({
    where: { showId, seatId: { in: seatIds } },
    select: { seatId: true },
  });
  if (alreadyBooked) {
    await incrMetric('locks_conflict');
    throw conflict('SEAT_TAKEN', 'That seat was just booked by someone else', { seatId: alreadyBooked.seatId });
  }

  let hold = groupCode ? await findGroupHold(groupCode) : await activeHold(keys.userHold(showId, userId));
  let created = false;
  if (!hold) {
    created = true;
    hold = {
      id: crypto.randomUUID(),
      showId,
      userId: groupCode ? (input.groupHostId ?? userId) : userId,
      kind: groupCode ? 'GROUP' : 'SOLO',
      groupCode,
      expiresAt: Date.now() + (groupCode ? GROUP_HOLD_MS : SOLO_HOLD_MS),
    };
  }

  const current = created ? {} : await holdSeatMap(hold.id);
  const mineAfter = new Set([
    ...Object.entries(current)
      .filter(([, uid]) => uid === userId)
      .map(([sid]) => sid),
    ...seatIds,
  ]);
  if (mineAfter.size > MAX_SEATS_PER_USER) {
    throw badRequest(`You can hold up to ${MAX_SEATS_PER_USER} seats per show`);
  }
  const takenByOtherMember = seatIds.find((id) => current[id] && current[id] !== userId);
  if (takenByOtherMember) {
    throw conflict('SEAT_TAKEN', 'A friend in your group already picked that seat', { seatId: takenByOtherMember });
  }

  const ttl = hold.expiresAt - Date.now();
  if (created) await writeHold(hold);
  const result = await lockSeatsAtomic(showId, seatIds, hold.id, ttl);
  if (!result.ok) {
    await incrMetric('locks_conflict');
    if (created) await deleteHold(hold);
    throw conflict('SEAT_TAKEN', 'Someone just grabbed that seat — pick another', { seatId: result.conflictSeatId });
  }

  const pipe = redis.pipeline();
  for (const id of seatIds) pipe.hset(keys.holdSeats(hold.id), id, userId);
  pipe.pexpire(keys.holdSeats(hold.id), ttl + GRACE_MS);
  await pipe.exec();
  await incrMetric('locks_ok', seatIds.length);

  if (created && hold.kind === 'SOLO') await scheduleHoldExpiry(hold.id, ttl);
  await broadcastSeats(showId, seatIds);
  return { hold: await getHoldDTO(hold.id), created };
}

/** Releases seats of a hold. Solo: owner only. Group: each member can release only their own seats. */
export async function releaseSeats(holdId: string, userId: string, seatIds?: string[]) {
  const hold = await readHold(holdId);
  if (!hold) throw notFound('Hold');
  const map = await holdSeatMap(holdId);
  if (hold.kind === 'SOLO' && hold.userId !== userId) throw forbidden('This hold is not yours');
  const candidates = seatIds ?? Object.keys(map);
  const target = candidates.filter((id) => map[id] && (hold.kind === 'SOLO' || map[id] === userId));
  await releaseInternal(hold, target);
  return target;
}

/** Releases seats without permission checks (expiry, kicks, cancellation). */
export async function releaseInternal(hold: HoldMeta, seatIds: string[]) {
  if (seatIds.length) {
    await releaseSeatsAtomic(hold.showId, seatIds, hold.id);
    await redis.hdel(keys.holdSeats(hold.id), ...seatIds);
  }
  const remaining = await redis.hlen(keys.holdSeats(hold.id));
  if (remaining === 0 && hold.kind === 'SOLO') await deleteHold(hold);
  await broadcastSeats(hold.showId, seatIds);
}

/** After a successful booking: drop the locks (the seats are now BOOKED in Postgres). */
export async function consumeSeats(holdId: string, showId: string, seatIds: string[]) {
  const hold = await readHold(holdId);
  await releaseSeatsAtomic(showId, seatIds, holdId);
  if (!hold) return;
  if (seatIds.length) await redis.hdel(keys.holdSeats(holdId), ...seatIds);
  if (hold.kind === 'SOLO' && (await redis.hlen(keys.holdSeats(holdId))) === 0) await deleteHold(hold);
}

export async function getHoldDTO(holdId: string): Promise<HoldDTO> {
  const hold = await readHold(holdId);
  if (!hold) throw notFound('Hold');
  const [map, show] = await Promise.all([
    holdSeatMap(holdId),
    prisma.show.findUnique({ where: { id: hold.showId } }),
  ]);
  if (!show) throw notFound('Show');
  const seats = (await venueSeats(show.venueId)).filter((s) => map[s.id]);
  return {
    holdId,
    showId: hold.showId,
    kind: hold.kind,
    groupCode: hold.groupCode,
    expiresAt: hold.expiresAt,
    seats: seats.map((s) => ({ ...toSeatDTO(s), price: tierPrice(show, s.tier), userId: map[s.id] })),
  };
}

export async function getMyHold(showId: string, userId: string) {
  const hold = await activeHold(keys.userHold(showId, userId));
  if (!hold) return null;
  const dto = await getHoldDTO(hold.id);
  return dto.seats.length ? dto : null;
}

export function describeSeats(seats: { row: string; number: number }[]) {
  return seats.map(seatLabel).join(', ');
}

/** Called by the expiry job for solo holds. */
export async function expireHold(holdId: string) {
  const hold = await readHold(holdId);
  if (!hold || hold.kind !== 'SOLO') return;
  if (hold.expiresAt > Date.now() + 500) {
    // Was re-created/extended; check again later.
    await scheduleHoldExpiry(holdId, hold.expiresAt - Date.now());
    return;
  }
  const map = await holdSeatMap(holdId);
  await releaseInternal(hold, Object.keys(map));
  await deleteHold(hold);
  await prisma.booking.updateMany({ where: { holdId, status: 'PENDING' }, data: { status: 'FAILED' } });
}
