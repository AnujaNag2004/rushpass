import type { Seat } from '@prisma/client';
import type { SeatState, SeatUpdatePayload, ShowSeatsResponse } from '@rushpass/shared';
import { SOCKET } from '@rushpass/shared';
import { notFound } from '../lib/errors.js';
import { seatOwners } from '../lib/locks.js';
import { prisma } from '../lib/prisma.js';
import { keys, redis } from '../lib/redis.js';
import { emitTo, rooms } from '../lib/socket.js';
import { toSeatDTO, toShowDTO } from './dto.js';

/* Seats of a venue rarely change, so cache them in memory. */
const venueSeatCache = new Map<string, Seat[]>();

export async function venueSeats(venueId: string) {
  let seats = venueSeatCache.get(venueId);
  if (!seats) {
    seats = await prisma.seat.findMany({ where: { venueId }, orderBy: [{ y: 'asc' }, { x: 'asc' }] });
    venueSeatCache.set(venueId, seats);
  }
  return seats;
}

export function invalidateVenueSeats(venueId: string) {
  venueSeatCache.delete(venueId);
}

/** Resolves the live status of the given seats: DB for bookings, Redis for holds. */
export async function seatStates(showId: string, seatIds: string[]): Promise<SeatState[]> {
  if (!seatIds.length) return [];
  const [booked, owners] = await Promise.all([
    prisma.bookingSeat.findMany({ where: { showId, seatId: { in: seatIds } }, select: { seatId: true } }),
    seatOwners(showId, seatIds),
  ]);
  const bookedSet = new Set(booked.map((b) => b.seatId));

  const holdIds = [...new Set(owners.filter((o): o is string => !!o))];
  const holdInfo = new Map<string, { groupCode?: string; userId?: string; seats: Record<string, string> }>();
  if (holdIds.length) {
    const pipe = redis.pipeline();
    for (const id of holdIds) {
      pipe.hgetall(keys.hold(id));
      pipe.hgetall(keys.holdSeats(id));
    }
    const res = await pipe.exec();
    holdIds.forEach((id, i) => {
      const hold = (res?.[i * 2]?.[1] ?? {}) as Record<string, string>;
      const seats = (res?.[i * 2 + 1]?.[1] ?? {}) as Record<string, string>;
      holdInfo.set(id, { groupCode: hold.groupCode || undefined, userId: hold.userId, seats });
    });
  }

  return seatIds.map((seatId, i) => {
    if (bookedSet.has(seatId)) return { seatId, status: 'BOOKED' };
    const owner = owners[i];
    if (owner) {
      const info = holdInfo.get(owner);
      return {
        seatId,
        status: 'HELD',
        userId: info?.seats[seatId] ?? info?.userId,
        groupCode: info?.groupCode,
      };
    }
    return { seatId, status: 'AVAILABLE' };
  });
}

export async function getShowSeats(showId: string): Promise<ShowSeatsResponse> {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { venue: { include: { _count: { select: { seats: true } } } }, event: true },
  });
  if (!show) throw notFound('Show');
  const seats = await venueSeats(show.venueId);
  const states = await seatStates(
    showId,
    seats.map((s) => s.id),
  );
  const stateMap: Record<string, SeatState> = {};
  for (const st of states) if (st.status !== 'AVAILABLE') stateMap[st.seatId] = st;
  return {
    show: {
      ...toShowDTO(show),
      capacity: seats.length,
      seatsLeft: seats.length - states.filter((s) => s.status !== 'AVAILABLE').length,
      event: {
        id: show.event.id,
        title: show.event.title,
        slug: show.event.slug,
        bannerUrl: show.event.bannerUrl,
        category: show.event.category,
      },
    },
    seats: seats.map(toSeatDTO),
    states: stateMap,
  };
}

/** Number of seats that are neither booked nor held. */
export async function availability(showId: string, venueId?: string) {
  const vId = venueId ?? (await prisma.show.findUnique({ where: { id: showId }, select: { venueId: true } }))?.venueId;
  if (!vId) return 0;
  const seats = await venueSeats(vId);
  const ids = seats.map((s) => s.id);
  const [bookedCount, owners] = await Promise.all([prisma.bookingSeat.count({ where: { showId } }), seatOwners(showId, ids)]);
  const held = owners.filter(Boolean).length;
  return Math.max(0, ids.length - bookedCount - held);
}

const availabilityTimers = new Map<string, NodeJS.Timeout>();

/** Broadcasts fresh state for the changed seats and (debounced) the seats-left counter. */
export async function broadcastSeats(showId: string, seatIds: string[]) {
  if (!seatIds.length) return;
  const states = await seatStates(showId, seatIds);
  emitTo(rooms.show(showId), SOCKET.SEAT_UPDATE, { showId, states } satisfies SeatUpdatePayload);

  if (availabilityTimers.has(showId)) return;
  availabilityTimers.set(
    showId,
    setTimeout(async () => {
      availabilityTimers.delete(showId);
      try {
        const available = await availability(showId);
        emitTo(rooms.show(showId), SOCKET.SHOW_AVAILABILITY, { showId, available });
      } catch {
        /* best effort */
      }
    }, 400),
  );
}
