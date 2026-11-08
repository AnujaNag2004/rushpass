import { seatLabel } from '@rushpass/shared';
import { audit } from '../lib/audit.js';
import { verifyTicketToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';

export type CheckinResult =
  | { result: 'INVALID'; message: string }
  | {
      result: 'VALID' | 'ALREADY_USED';
      message: string;
      holder: string;
      event: string;
      venue: string;
      startsAt: string;
      seats: string[];
      checkedInAt: string;
    };

export async function verifyTicket(token: string, staffId: string): Promise<CheckinResult> {
  let bookingId: string;
  try {
    bookingId = verifyTicketToken(token).bid;
  } catch {
    return { result: 'INVALID', message: 'This QR code is not a RushPass ticket' };
  }
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      show: { include: { event: true, venue: true } },
      seats: { include: { seat: true, ticket: true } },
    },
  });
  if (!booking || booking.status !== 'CONFIRMED' || !booking.seats.length) {
    return { result: 'INVALID', message: 'This booking is cancelled or does not exist' };
  }

  const base = {
    holder: booking.user.name,
    event: booking.show.event.title,
    venue: booking.show.venue.name,
    startsAt: booking.show.startsAt.toISOString(),
    seats: booking.seats.map((s) => seatLabel(s.seat)),
  };
  const firstCheckin = booking.seats.find((s) => s.ticket?.checkedInAt)?.ticket?.checkedInAt;
  if (firstCheckin) {
    return { result: 'ALREADY_USED', message: 'Already scanned', ...base, checkedInAt: firstCheckin.toISOString() };
  }

  const now = new Date();
  // Conditional update guards against two scanners admitting the same QR at once.
  const updated = await prisma.ticket.updateMany({
    where: { bookingSeat: { bookingId }, checkedInAt: null },
    data: { checkedInAt: now, checkedInBy: staffId },
  });
  if (updated.count === 0) {
    return { result: 'ALREADY_USED', message: 'Already scanned', ...base, checkedInAt: now.toISOString() };
  }
  audit(staffId, 'ticket.checkin', 'Booking', bookingId, { seats: base.seats });
  return { result: 'VALID', message: 'Welcome!', ...base, checkedInAt: now.toISOString() };
}
