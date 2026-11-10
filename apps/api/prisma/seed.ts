import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Category, type Role } from '@prisma/client';
import { Redis } from 'ioredis';
import { MEMBER_COLORS, generateSeats, priceBreakdown, tierPrice, type VenueLayout } from '@rushpass/shared';
import { signTicketToken } from '../src/lib/jwt.js';

const prisma = new PrismaClient();
const PASSWORD = 'Password@123';
const DAY = 86_400_000;
const HOUR = 3_600_000;

const img = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;

const rows = (labels: string[], seats: number, tier: (i: number) => 'REGULAR' | 'PREMIUM' | 'VIP', gapsAfter: number[]) =>
  labels.map((label, i) => ({ label, seats, tier: tier(i), gapsAfter }));

const THEATRE: VenueLayout = {
  sections: [
    { name: 'Stalls', rows: rows('ABCDEFGHIJ'.split(''), 20, (i) => (i < 2 ? 'VIP' : i < 5 ? 'PREMIUM' : 'REGULAR'), [10]) },
    { name: 'Balcony', rows: rows('KLMNO'.split(''), 20, () => 'REGULAR', [10]) },
  ],
}; // 300 seats

const CLUB: VenueLayout = {
  sections: [{ name: 'Floor', rows: rows('ABCDEFGH'.split(''), 15, (i) => (i < 2 ? 'VIP' : i < 4 ? 'PREMIUM' : 'REGULAR'), [5, 10]) }],
}; // 120 seats

const ARENA: VenueLayout = {
  sections: [
    { name: 'VIP Pit', rows: rows(['PA', 'PB', 'PC', 'PD'], 20, () => 'VIP', [10]) },
    { name: 'Main', rows: rows('ABCDEFGHIJKLMN'.split(''), 30, (i) => (i < 4 ? 'PREMIUM' : 'REGULAR'), [10, 20]) },
  ],
}; // 500 seats

interface EventSeed {
  title: string;
  category: Category;
  banner: string;
  venue: 'theatre' | 'club' | 'arena';
  prices: [number, number, number]; // rupees
  description: string;
  days: number[];
  drop?: boolean;
}

const EVENTS: EventSeed[] = [
  {
    title: 'Neon Nights: Synthwave Live',
    category: 'CONCERT',
    banner: img('1501386761578-eac5c94b800a'),
    venue: 'arena',
    prices: [1499, 2999, 5999],
    description: 'A retro-futuristic night of analogue synths, laser walls and a light show built for the big room. Doors open 90 minutes early.',
    days: [6, 13],
  },
  {
    title: 'Starlight Arena Tour — Ticket Drop',
    category: 'CONCERT',
    banner: img('1470229722913-7c0e2dbbafd3'),
    venue: 'arena',
    prices: [1999, 3999, 7999],
    description: 'The most-anticipated show of the season. Tickets release as a timed drop — join the fair waiting room before the sale opens and get a random spot in line.',
    days: [20],
    drop: true,
  },
  {
    title: 'Monsoon Beats Festival',
    category: 'FESTIVAL',
    banner: img('1533174072545-7a4b6ad7a6c3'),
    venue: 'arena',
    prices: [999, 1999, 3999],
    description: 'Twelve hours, three stages of sound and a food street that never sleeps. Indie, electronic and folk fusion under one roof.',
    days: [27],
  },
  {
    title: 'Midnight Jazz at the Blue Room',
    category: 'CONCERT',
    banner: img('1415201364774-f6f0bb35f28f'),
    venue: 'club',
    prices: [799, 1299, 2199],
    description: 'An intimate late-night set from a seven-piece band. Low lights, smooth brass and the best seats right by the stage.',
    days: [-6, 3, 10, 17],
  },
  {
    title: 'Laugh Riot: Stand-up Special',
    category: 'COMEDY',
    banner: img('1585647347483-22b66260dfff'),
    venue: 'club',
    prices: [499, 899, 1499],
    description: 'Four comics, one mic and zero chill. A tight 90-minute showcase of the sharpest new voices on the circuit. 16+.',
    days: [-3, 2, 9],
  },
  {
    title: 'Open Mic Mayhem',
    category: 'COMEDY',
    banner: img('1527224857830-43a7acc85260'),
    venue: 'club',
    prices: [299, 499, 799],
    description: 'Anything can happen. Fresh comics test brand-new material — you vote for the night’s winner.',
    days: [5, 12],
  },
  {
    title: 'The Last Projection — Premiere Night',
    category: 'MOVIE',
    banner: img('1489599849927-2ee91cede3ba'),
    venue: 'theatre',
    prices: [399, 699, 1199],
    description: 'Red-carpet premiere of an indie sci-fi thriller, followed by a live Q&A with the director and cast.',
    days: [4, 8],
  },
  {
    title: 'Retro Cinema Marathon',
    category: 'MOVIE',
    banner: img('1536440136628-849c177e76a1'),
    venue: 'theatre',
    prices: [349, 599, 999],
    description: 'Three restored classics back to back on the big screen. Unlimited popcorn for Premium and VIP seats.',
    days: [-10, 7, 14],
  },
  {
    title: 'City Derby Finals — Big Screen',
    category: 'SPORTS',
    banner: img('1540747913346-19e32dc3e97e'),
    venue: 'arena',
    prices: [599, 1199, 2499],
    description: 'Watch the final live on a giant LED wall with the loudest crowd in town. Halftime DJ set included.',
    days: [9],
  },
  {
    title: 'Hamlet Reimagined',
    category: 'THEATRE',
    banner: img('1503095396549-807759245b35'),
    venue: 'theatre',
    prices: [599, 999, 1799],
    description: 'Shakespeare’s tragedy staged in a neon-lit near future. Two hours forty minutes with one interval.',
    days: [11, 18, 25],
  },
  {
    title: 'Indie Underground Sessions',
    category: 'CONCERT',
    banner: img('1459749411175-04bf5292ceea'),
    venue: 'club',
    prices: [599, 999, 1599],
    description: 'Three up-and-coming bands, one sweaty basement and a sound system that hits different.',
    days: [15],
  },
  {
    title: 'Bollywood Retro Orchestra',
    category: 'CONCERT',
    banner: img('1514525253161-7a46d19cd819'),
    venue: 'theatre',
    prices: [899, 1599, 2999],
    description: 'A 40-piece orchestra plays the golden-era film songs you grew up with. Sing-along strongly encouraged.',
    days: [16, 23],
  },
];

async function clearRedis() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const patterns = ['seat:*', 'hold:*', 'holdseats:*', 'userhold:*', 'grouphold:*', 'queue:*', 'admit:*', 'stats:*', 'metrics:*', 'presence:*', 'chat:*', 'activity:*', 'idem:*'];
  for (const pattern of patterns) {
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
      cursor = next;
      if (batch.length) await redis.del(...batch);
    } while (cursor !== '0');
  }
  redis.disconnect();
}

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  console.log('🌱 Seeding RushPass…');
  await clearRedis();
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.bookingSeat.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.groupMember.deleteMany(),
    prisma.groupRoom.deleteMany(),
    prisma.show.deleteMany(),
    prisma.event.deleteMany(),
    prisma.seat.deleteMany(),
    prisma.venue.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mk = (name: string, email: string, role: Role, i: number) =>
    prisma.user.create({ data: { name, email, role, passwordHash, avatarColor: MEMBER_COLORS[i % MEMBER_COLORS.length] } });

  const admin = await mk('Riya Admin', 'admin@rushpass.dev', 'ADMIN', 0);
  const org1 = await mk('Kabir Live Events', 'organizer@rushpass.dev', 'ORGANIZER', 1);
  const org2 = await mk('Tara Comedy Co.', 'organizer2@rushpass.dev', 'ORGANIZER', 2);
  const staff = await mk('Sam Gatekeeper', 'staff@rushpass.dev', 'STAFF', 3);
  const names = ['Aarav Shah', 'Meera Iyer', 'Rohan Gupta', 'Ananya Rao', 'Vikram Nair', 'Ishita Das', 'Kunal Mehta', 'Sara Khan', 'Dev Patel', 'Nisha Verma'];
  const users = [];
  for (const [i, name] of names.entries()) {
    users.push(await mk(name, i === 0 ? 'user@rushpass.dev' : `user${i + 1}@rushpass.dev`, 'USER', i + 4));
  }
  // A wider crowd of customers so sales aren't concentrated on a handful of accounts.
  const FIRST = ['Aditi', 'Arjun', 'Diya', 'Farhan', 'Gauri', 'Harsh', 'Isha', 'Jai', 'Kavya', 'Laksh', 'Mira', 'Neel', 'Pooja', 'Rahul', 'Sneha', 'Tanvi', 'Uday', 'Varun', 'Yash', 'Zoya'];
  const LAST = ['Agarwal', 'Bose', 'Chopra', 'Desai', 'Fernandes', 'Ghosh', 'Joshi', 'Kapoor', 'Menon', 'Reddy'];
  const crowd = await Promise.all(
    Array.from({ length: 40 }, (_, i) => {
      const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
      return mk(name, `${name.toLowerCase().replace(' ', '.')}${i}@example.com`, 'USER', i);
    }),
  );
  const demoUser = users[0];
  const buyers = [...users.slice(1), ...crowd];

  const venueDefs = {
    theatre: { name: 'Lumière Grand Theatre', city: 'Mumbai', address: 'Marine Drive, Churchgate, Mumbai', layout: THEATRE, organizerId: org1.id },
    club: { name: 'The Blue Room', city: 'Bengaluru', address: '12 Church Street, Bengaluru', layout: CLUB, organizerId: org2.id },
    arena: { name: 'Skyline Arena', city: 'Delhi', address: 'Aerocity, New Delhi', layout: ARENA, organizerId: org1.id },
  };
  const venues: Record<string, { id: string; seats: { id: string; tier: 'REGULAR' | 'PREMIUM' | 'VIP'; row: string; number: number }[] }> = {};
  for (const [key, v] of Object.entries(venueDefs)) {
    const venue = await prisma.venue.create({
      data: {
        name: v.name,
        city: v.city,
        address: v.address,
        organizerId: v.organizerId,
        layoutJson: v.layout,
        seats: { create: generateSeats(v.layout) },
      },
      include: { seats: { select: { id: true, tier: true, row: true, number: true } } },
    });
    venues[key] = venue;
  }

  const now = Date.now();
  let bookingCount = 0;
  type SeatRef = { id: string; tier: 'REGULAR' | 'PREMIUM' | 'VIP'; row: string; number: number };
  type ShowRef = { id: string; priceRegular: number; pricePremium: number; priceVip: number };
  const shows: { show: ShowRef; startsAt: Date; free: SeatRef[] }[] = [];

  /** Takes `n` seats next to each other in one row when it can, so the demo tickets look hand-picked. */
  const adjacent = (free: SeatRef[], n: number) => {
    for (const first of free) {
      const run = Array.from({ length: n }, (_, k) => free.find((f) => f.row === first.row && f.number === first.number + k));
      if (run.every(Boolean)) return run as SeatRef[];
    }
    return free.slice(0, n);
  };

  const book = async (show: ShowRef, chosen: SeatRef[], buyer: { id: string }, startsAt: Date, cancelled = false) => {
    const subtotal = chosen.reduce((sum, seat) => sum + tierPrice(show, seat.tier), 0);
    const breakdown = priceBreakdown(subtotal);
    const bookingId = crypto.randomUUID();
    const qrToken = signTicketToken(bookingId);
    // Bought some time in the two weeks before the show (or before today, for shows still to come).
    const latest = Math.min(now, startsAt.getTime() - HOUR);
    const createdAt = new Date(latest - Math.random() * 13 * DAY);
    const attended = startsAt.getTime() < now && Math.random() < 0.92;
    await prisma.booking.create({
      data: {
        id: bookingId,
        userId: buyer.id,
        showId: show.id,
        status: cancelled ? 'CANCELLED' : 'CONFIRMED',
        heldSeatIds: chosen.map((c) => c.id),
        ...breakdown,
        createdAt,
        // A cancelled booking gives its seats back, exactly like the cancel endpoint does.
        seats: cancelled
          ? undefined
          : {
              create: chosen.map((seat) => ({
                showId: show.id,
                seatId: seat.id,
                price: tierPrice(show, seat.tier),
                ticket: { create: { qrToken, checkedInAt: attended ? new Date(startsAt.getTime() - Math.random() * HOUR) : null } },
              })),
            },
        payments: {
          create: {
            provider: 'MOCK',
            providerOrderId: `seed_order_${bookingId}`,
            providerPaymentId: `seed_pay_${bookingId}`,
            status: cancelled ? 'REFUNDED' : 'PAID',
            amount: breakdown.total,
            createdAt,
          },
        },
      },
    });
    bookingCount++;
  };
  let dropShowId = '';
  for (const [i, e] of EVENTS.entries()) {
    const venue = venues[e.venue];
    const organizerId = venueDefs[e.venue].organizerId;
    const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const event = await prisma.event.create({
      data: {
        title: e.title,
        slug,
        description: e.description,
        category: e.category,
        bannerUrl: e.banner,
        organizerId,
        status: 'PUBLISHED',
        createdAt: new Date(now - (EVENTS.length - i) * HOUR),
      },
    });
    for (const d of e.days) {
      const startsAt = new Date(now + d * DAY);
      startsAt.setUTCHours(14, 0, 0, 0); // 7:30 PM IST
      const show = await prisma.show.create({
        data: {
          eventId: event.id,
          venueId: venue.id,
          startsAt,
          isDrop: !!e.drop,
          saleOpensAt: e.drop ? new Date(now + 5 * 60_000) : null,
          admitPerMinute: e.drop ? 120 : 60,
          priceRegular: e.prices[0] * 100,
          pricePremium: e.prices[1] * 100,
          priceVip: e.prices[2] * 100,
        },
      });
      if (e.drop) {
        dropShowId = show.id;
        continue;
      }

      // Pre-sell a realistic chunk of seats so dashboards and seat maps have data.
      // Shows that already happened sold better and have their tickets scanned.
      const past = d < 0;
      const fill = past ? 0.6 + Math.random() * 0.3 : 0.12 + Math.random() * 0.45;
      const pool = shuffle(venue.seats).slice(0, Math.floor(venue.seats.length * fill));
      shows.push({ show, startsAt, free: shuffle(venue.seats.filter((seat) => !pool.includes(seat))) });
      while (pool.length) {
        const n = Math.min(pool.length, 1 + Math.floor(Math.random() * 4));
        await book(show, pool.splice(0, n), buyers[Math.floor(Math.random() * buyers.length)], startsAt);
      }
    }
  }

  // The demo account gets a small, believable history: a few upcoming nights, two it attended and one it cancelled.
  const upcoming = shows.filter((x) => x.startsAt.getTime() > now + 2 * DAY).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const attended = shows.filter((x) => x.startsAt.getTime() < now);
  for (const [i, x] of [upcoming[0], upcoming[2], upcoming[5]].entries()) {
    if (x) await book(x.show, adjacent(x.free, [2, 4, 1][i]), demoUser, x.startsAt);
  }
  for (const x of attended.slice(0, 2)) await book(x.show, adjacent(x.free, 2), demoUser, x.startsAt);
  if (upcoming[3]) await book(upcoming[3].show, adjacent(upcoming[3].free, 2), demoUser, upcoming[3].startsAt, true);

  console.log(`✅ ${EVENTS.length} events, 3 venues (${Object.values(venues).reduce((s, v) => s + v.seats.length, 0)} seats), ${bookingCount} bookings`);
  console.log(`🎟️  Drop show ${dropShowId} opens at ${new Date(now + 5 * 60_000).toLocaleTimeString()}`);
  console.log('\nDemo accounts (password for all: ' + PASSWORD + ')');
  console.table([
    { role: 'ADMIN', email: admin.email },
    { role: 'ORGANIZER', email: org1.email },
    { role: 'ORGANIZER', email: org2.email },
    { role: 'STAFF', email: staff.email },
    ...users.map((u) => ({ role: 'USER', email: u.email })),
  ]);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
