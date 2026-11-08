import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { EventDTO, EventQuery, Paginated } from '@rushpass/shared';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { AccessPayload } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { availability } from './seatState.service.js';
import { toEventBase, toShowDTO } from './dto.js';

export function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'event'}-${crypto.randomBytes(2).toString('hex')}`;
}

const showInclude = { venue: { include: { _count: { select: { seats: true } } } } } satisfies Prisma.ShowInclude;

export async function listEvents(query: EventQuery, viewer?: AccessPayload): Promise<Paginated<EventDTO>> {
  const now = new Date();
  const mine = query.mine === 'true' && viewer && ['ORGANIZER', 'ADMIN'].includes(viewer.role);

  const showWhere: Prisma.ShowWhereInput = {
    startsAt: { gte: query.from ? new Date(query.from) : now, ...(query.to ? { lte: new Date(query.to) } : {}) },
    ...(query.city ? { venue: { city: { equals: query.city, mode: 'insensitive' } } } : {}),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? { priceRegular: { gte: query.minPrice, lte: query.maxPrice } }
      : {}),
    ...(query.drops === 'true' ? { isDrop: true } : {}),
  };

  const where: Prisma.EventWhereInput = {
    ...(mine ? (viewer.role === 'ADMIN' ? {} : { organizerId: viewer.sub }) : { status: 'PUBLISHED' }),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { description: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(mine ? {} : { shows: { some: showWhere } }),
  };

  const events = await prisma.event.findMany({
    where,
    include: {
      organizer: { select: { id: true, name: true } },
      shows: { where: mine ? {} : showWhere, include: showInclude, orderBy: { startsAt: 'asc' } },
    },
  });

  const showIds = events.flatMap((e) => e.shows.map((s) => s.id));
  const soldCounts = showIds.length
    ? await prisma.bookingSeat.groupBy({ by: ['showId'], where: { showId: { in: showIds } }, _count: true })
    : [];
  const sold = new Map(soldCounts.map((c) => [c.showId, c._count]));

  const dtos: EventDTO[] = events.map((e) => {
    const capacity = e.shows.reduce((sum, s) => sum + s.venue._count.seats, 0);
    const soldTotal = e.shows.reduce((sum, s) => sum + (sold.get(s.id) ?? 0), 0);
    const drops = e.shows.filter((s) => s.isDrop && s.saleOpensAt);
    return {
      ...toEventBase(e),
      organizer: e.organizer,
      city: e.shows[0]?.venue.city,
      minPrice: e.shows.length ? Math.min(...e.shows.map((s) => s.priceRegular)) : undefined,
      nextShowAt: e.shows[0]?.startsAt.toISOString() ?? null,
      hasDrop: drops.length > 0,
      nextDropAt: drops[0]?.saleOpensAt?.toISOString() ?? null,
      soldRatio: capacity ? soldTotal / capacity : 0,
    };
  });

  const sorters: Record<EventQuery['sort'], (a: EventDTO, b: EventDTO) => number> = {
    date: (a, b) => (a.nextShowAt ?? '9').localeCompare(b.nextShowAt ?? '9'),
    price_asc: (a, b) => (a.minPrice ?? 0) - (b.minPrice ?? 0),
    price_desc: (a, b) => (b.minPrice ?? 0) - (a.minPrice ?? 0),
    newest: (a, b) => b.id.localeCompare(a.id),
    popular: (a, b) => (b.soldRatio ?? 0) - (a.soldRatio ?? 0),
  };
  dtos.sort(sorters[query.sort]);

  const start = (query.page - 1) * query.pageSize;
  return {
    data: dtos.slice(start, start + query.pageSize),
    meta: { page: query.page, pageSize: query.pageSize, total: dtos.length },
  };
}

export async function getEvent(slugOrId: string, viewer?: AccessPayload): Promise<EventDTO> {
  const event = await prisma.event.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: {
      organizer: { select: { id: true, name: true } },
      shows: { include: showInclude, orderBy: { startsAt: 'asc' } },
    },
  });
  if (!event) throw notFound('Event');
  const canManage = viewer && (viewer.role === 'ADMIN' || viewer.sub === event.organizerId);
  if (event.status !== 'PUBLISHED' && !canManage) throw notFound('Event');

  const now = Date.now();
  const shows = event.shows.filter((s) => canManage || s.startsAt.getTime() > now);
  const showDTOs = await Promise.all(
    shows.map(async (s) => ({
      ...toShowDTO(s),
      capacity: s.venue._count.seats,
      seatsLeft: await availability(s.id, s.venueId),
    })),
  );
  return {
    ...toEventBase(event),
    organizer: event.organizer,
    city: shows[0]?.venue.city,
    minPrice: shows.length ? Math.min(...shows.map((s) => s.priceRegular)) : undefined,
    nextShowAt: shows[0]?.startsAt.toISOString() ?? null,
    hasDrop: shows.some((s) => s.isDrop),
    shows: showDTOs,
  };
}

type EventInput = {
  title: string;
  description: string;
  category: EventDTO['category'];
  bannerUrl: string;
  status: EventDTO['status'];
};

export async function createEvent(input: EventInput, user: AccessPayload) {
  const event = await prisma.event.create({
    data: { ...input, slug: slugify(input.title), organizerId: user.sub },
  });
  audit(user.sub, 'event.created', 'Event', event.id, { title: event.title });
  return toEventBase(event);
}

async function assertOwnsEvent(eventId: string, user: AccessPayload) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw notFound('Event');
  if (user.role !== 'ADMIN' && event.organizerId !== user.sub) throw forbidden();
  return event;
}

export async function updateEvent(id: string, input: Partial<EventInput>, user: AccessPayload) {
  await assertOwnsEvent(id, user);
  const event = await prisma.event.update({ where: { id }, data: input });
  audit(user.sub, 'event.updated', 'Event', id, input);
  return toEventBase(event);
}

export async function deleteEvent(id: string, user: AccessPayload) {
  await assertOwnsEvent(id, user);
  const sold = await prisma.bookingSeat.count({ where: { show: { eventId: id } } });
  if (sold > 0) {
    // Never delete history: cancel instead.
    await prisma.event.update({ where: { id }, data: { status: 'CANCELLED' } });
    audit(user.sub, 'event.cancelled', 'Event', id);
    return { cancelled: true };
  }
  await prisma.event.delete({ where: { id } });
  audit(user.sub, 'event.deleted', 'Event', id);
  return { deleted: true };
}

type ShowInput = {
  venueId: string;
  startsAt: string;
  priceRegular: number;
  pricePremium: number;
  priceVip: number;
  isDrop: boolean;
  saleOpensAt?: string | null;
  admitPerMinute: number;
};

export async function createShow(eventId: string, input: ShowInput, user: AccessPayload) {
  await assertOwnsEvent(eventId, user);
  const venue = await prisma.venue.findUnique({ where: { id: input.venueId } });
  if (!venue) throw notFound('Venue');
  if (user.role !== 'ADMIN' && venue.organizerId !== user.sub) throw forbidden('Use one of your own venues');
  if (new Date(input.startsAt).getTime() < Date.now()) throw badRequest('Show time must be in the future');
  const show = await prisma.show.create({
    data: {
      ...input,
      eventId,
      startsAt: new Date(input.startsAt),
      saleOpensAt: input.isDrop && input.saleOpensAt ? new Date(input.saleOpensAt) : null,
    },
    include: showInclude,
  });
  audit(user.sub, 'show.created', 'Show', show.id);
  return toShowDTO(show);
}

export async function updateShow(id: string, input: Partial<ShowInput>, user: AccessPayload) {
  const show = await prisma.show.findUnique({ where: { id } });
  if (!show) throw notFound('Show');
  await assertOwnsEvent(show.eventId, user);
  const updated = await prisma.show.update({
    where: { id },
    data: {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      saleOpensAt: input.saleOpensAt === undefined ? undefined : input.saleOpensAt ? new Date(input.saleOpensAt) : null,
    },
    include: showInclude,
  });
  audit(user.sub, 'show.updated', 'Show', id, input);
  return toShowDTO(updated);
}
