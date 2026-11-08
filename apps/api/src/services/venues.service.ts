import type { Prisma } from '@prisma/client';
import type { VenueLayout } from '@rushpass/shared';
import { generateSeats } from '@rushpass/shared';
import { audit } from '../lib/audit.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import type { AccessPayload } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { invalidateVenueSeats } from './seatState.service.js';
import { toVenueDTO } from './dto.js';

export const DEFAULT_LAYOUT: VenueLayout = {
  sections: [
    {
      name: 'Stalls',
      rows: ['A', 'B', 'C', 'D', 'E', 'F'].map((label, i) => ({
        label,
        seats: 14,
        tier: i < 2 ? ('PREMIUM' as const) : ('REGULAR' as const),
        gapsAfter: [7],
      })),
    },
  ],
};

const withCount = { _count: { select: { seats: true } } } satisfies Prisma.VenueInclude;

export async function listVenues(user: AccessPayload) {
  const venues = await prisma.venue.findMany({
    where: user.role === 'ADMIN' ? {} : { organizerId: user.sub },
    include: withCount,
    orderBy: { createdAt: 'desc' },
  });
  return venues.map((v) => toVenueDTO(v, true));
}

export async function getVenue(id: string, user: AccessPayload) {
  const venue = await prisma.venue.findUnique({ where: { id }, include: withCount });
  if (!venue) throw notFound('Venue');
  if (user.role !== 'ADMIN' && venue.organizerId !== user.sub) throw forbidden();
  return toVenueDTO(venue, true);
}

export async function createVenue(
  input: { name: string; city: string; address: string; layout?: VenueLayout },
  user: AccessPayload,
) {
  const layout = input.layout ?? DEFAULT_LAYOUT;
  const venue = await prisma.venue.create({
    data: {
      name: input.name,
      city: input.city,
      address: input.address,
      organizerId: user.sub,
      layoutJson: layout as unknown as Prisma.InputJsonValue,
      seats: { create: generateSeats(layout) },
    },
    include: withCount,
  });
  audit(user.sub, 'venue.created', 'Venue', venue.id);
  return toVenueDTO(venue, true);
}

/** Replaces the seat map. Blocked once any ticket has been sold at this venue. */
export async function updateLayout(id: string, layout: VenueLayout, user: AccessPayload) {
  await getVenue(id, user);
  const sold = await prisma.bookingSeat.count({ where: { seat: { venueId: id } } });
  if (sold > 0) throw conflict('LAYOUT_LOCKED', 'Tickets were already sold here, so the layout can no longer change');
  await prisma.$transaction([
    prisma.seat.deleteMany({ where: { venueId: id } }),
    prisma.seat.createMany({ data: generateSeats(layout).map((s) => ({ ...s, venueId: id })) }),
    prisma.venue.update({ where: { id }, data: { layoutJson: layout as unknown as Prisma.InputJsonValue } }),
  ]);
  invalidateVenueSeats(id);
  audit(user.sub, 'venue.layout', 'Venue', id);
  return getVenue(id, user);
}
