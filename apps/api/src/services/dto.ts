import type { Event, Seat, Show, User, Venue } from '@prisma/client';
import type { EventDTO, SeatDTO, ShowDTO, UserDTO, VenueDTO, VenueLayout } from '@rushpass/shared';

export function toUserDTO(u: User): UserDTO {
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatarColor: u.avatarColor };
}

export function toVenueDTO(v: Venue & { _count?: { seats: number } }, withLayout = false): VenueDTO {
  return {
    id: v.id,
    name: v.name,
    city: v.city,
    address: v.address,
    capacity: v._count?.seats ?? 0,
    ...(withLayout ? { layoutJson: v.layoutJson as unknown as VenueLayout } : {}),
  };
}

export function toShowDTO(s: Show & { venue: Venue & { _count?: { seats: number } } }): ShowDTO {
  return {
    id: s.id,
    eventId: s.eventId,
    startsAt: s.startsAt.toISOString(),
    isDrop: s.isDrop,
    saleOpensAt: s.saleOpensAt?.toISOString() ?? null,
    admitPerMinute: s.admitPerMinute,
    priceRegular: s.priceRegular,
    pricePremium: s.pricePremium,
    priceVip: s.priceVip,
    venue: toVenueDTO(s.venue),
  };
}

export function toSeatDTO(s: Seat): SeatDTO {
  return { id: s.id, section: s.section, row: s.row, number: s.number, tier: s.tier, x: s.x, y: s.y };
}

export function toEventBase(e: Event): EventDTO {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description,
    category: e.category,
    bannerUrl: e.bannerUrl,
    status: e.status,
  };
}
