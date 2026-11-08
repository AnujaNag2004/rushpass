import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const ROLES = ['USER', 'ORGANIZER', 'ADMIN', 'STAFF'] as const;
export type Role = (typeof ROLES)[number];

export const TIERS = ['REGULAR', 'PREMIUM', 'VIP'] as const;
export type Tier = (typeof TIERS)[number];

export const CATEGORIES = ['CONCERT', 'MOVIE', 'COMEDY', 'SPORTS', 'THEATRE', 'FESTIVAL'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CITIES = ['Mumbai', 'Bengaluru', 'Delhi', 'Hyderabad', 'Pune'] as const;

export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export type GroupStatus = 'OPEN' | 'LOCKED' | 'PAYING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type MemberPaymentStatus = 'NONE' | 'PENDING' | 'PAID' | 'FAILED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'FAILED';
export type PaymentProviderName = 'RAZORPAY' | 'MOCK';

/* ------------------------------------------------------------------ */
/* Business constants                                                  */
/* ------------------------------------------------------------------ */

export const SOLO_HOLD_MS = 5 * 60 * 1000;
export const GROUP_HOLD_MS = 7 * 60 * 1000;
export const GROUP_EXTEND_MS = 2 * 60 * 1000;
export const MAX_SEATS_PER_USER = 8;
export const MAX_GROUP_MEMBERS = 8;
export const ADMISSION_TTL_SEC = 10 * 60;
export const FEE_RATE = 0.05;
export const GST_RATE = 0.18;
export const CANCEL_CUTOFF_MS = 24 * 60 * 60 * 1000;

export const MEMBER_COLORS = [
  '#7C5CFF',
  '#FF4D8D',
  '#FFB547',
  '#2EE6A6',
  '#38BDF8',
  '#F472B6',
  '#A3E635',
  '#FB923C',
] as const;

/* ------------------------------------------------------------------ */
/* Socket event names                                                  */
/* ------------------------------------------------------------------ */

export const SOCKET = {
  SHOW_JOIN: 'show:join',
  SHOW_LEAVE: 'show:leave',
  SEAT_UPDATE: 'seat:update',
  SHOW_AVAILABILITY: 'show:availability',

  GROUP_JOIN: 'group:join',
  GROUP_LEAVE: 'group:leave',
  GROUP_STATE: 'group:state',
  GROUP_PRESENCE: 'group:presence',
  GROUP_SEAT_SELECT: 'group:seat:select',
  GROUP_SEAT_RELEASE: 'group:seat:release',
  GROUP_CURSOR: 'group:cursor',
  GROUP_LOCKIN: 'group:lockin',
  GROUP_PAYMENT_UPDATE: 'group:payment:update',
  GROUP_CHAT: 'group:chat',
  GROUP_REACT: 'group:react',
  GROUP_ACTIVITY: 'group:activity',
  GROUP_EXPIRED: 'group:expired',
  GROUP_KICKED: 'group:kicked',

  QUEUE_WATCH: 'queue:watch',
  QUEUE_UNWATCH: 'queue:unwatch',
  QUEUE_TICK: 'queue:tick',
  QUEUE_ADMITTED: 'queue:admitted',
} as const;

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarColor: string;
}

export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
}

export interface VenueDTO {
  id: string;
  name: string;
  city: string;
  address: string;
  capacity: number;
  layoutJson?: VenueLayout;
}

export interface ShowDTO {
  id: string;
  eventId: string;
  startsAt: string;
  isDrop: boolean;
  saleOpensAt: string | null;
  admitPerMinute: number;
  priceRegular: number;
  pricePremium: number;
  priceVip: number;
  venue: VenueDTO;
  seatsLeft?: number;
  capacity?: number;
}

export interface EventDTO {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: Category;
  bannerUrl: string;
  status: EventStatus;
  organizer?: { id: string; name: string };
  city?: string;
  minPrice?: number;
  nextShowAt?: string | null;
  hasDrop?: boolean;
  nextDropAt?: string | null;
  soldRatio?: number;
  shows?: ShowDTO[];
}

export interface SeatDTO {
  id: string;
  section: string;
  row: string;
  number: number;
  tier: Tier;
  x: number;
  y: number;
}

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface SeatState {
  seatId: string;
  status: SeatStatus;
  userId?: string;
  groupCode?: string;
}

export interface ShowSeatsResponse {
  show: ShowDTO & { event: Pick<EventDTO, 'id' | 'title' | 'slug' | 'bannerUrl' | 'category'> };
  seats: SeatDTO[];
  states: Record<string, SeatState>;
}

export interface HoldDTO {
  holdId: string;
  showId: string;
  kind: 'SOLO' | 'GROUP';
  groupCode?: string;
  expiresAt: number;
  seats: (SeatDTO & { price: number; userId: string })[];
}

export interface SeatUpdatePayload {
  showId: string;
  states: SeatState[];
}

export interface GroupMemberDTO {
  userId: string;
  name: string;
  color: string;
  online: boolean;
  isHost: boolean;
  paymentStatus: MemberPaymentStatus;
  seatIds: string[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  color: string;
  text: string;
  at: number;
  reactions: Record<string, string[]>;
}

export interface ActivityItem {
  id: string;
  text: string;
  color?: string;
  at: number;
}

export interface GroupStateDTO {
  code: string;
  status: GroupStatus;
  hostId: string;
  holdId: string | null;
  expiresAt: number | null;
  extended: boolean;
  show: ShowDTO & { event: Pick<EventDTO, 'id' | 'title' | 'slug' | 'bannerUrl'> };
  members: GroupMemberDTO[];
  chat: ChatMessage[];
  activity: ActivityItem[];
}

export interface QueueStatusDTO {
  showId: string;
  saleOpensAt: string | null;
  saleOpen: boolean;
  inQueue: boolean;
  position: number | null;
  ahead: number;
  behind: number;
  total: number;
  admitted: boolean;
  admissionToken: string | null;
  admissionExpiresAt: number | null;
  estimatedWaitSec: number | null;
  admitPerMinute: number;
}

export interface CheckoutOrderDTO {
  bookingId: string;
  provider: PaymentProviderName;
  orderId: string;
  amount: number;
  currency: 'INR';
  keyId?: string;
  expiresAt: number;
  breakdown: PriceBreakdown;
}

export interface TicketDTO {
  id: string;
  seat: SeatDTO;
  price: number;
  checkedInAt: string | null;
}

export interface BookingDTO {
  id: string;
  status: BookingStatus;
  subtotal: number;
  fees: number;
  tax: number;
  total: number;
  createdAt: string;
  groupCode?: string | null;
  holdId?: string | null;
  holdExpiresAt?: number | null;
  show: ShowDTO & { event: Pick<EventDTO, 'id' | 'title' | 'slug' | 'bannerUrl' | 'category'> };
  tickets: TicketDTO[];
  heldSeats?: SeatDTO[];
  qrDataUrl?: string | null;
  payment?: { provider: PaymentProviderName; status: string; orderId: string } | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface RushMonitorDTO {
  activeSockets: number;
  queueLength: number;
  admittedTotal: number;
  seatsLocked: number;
  locksOk: number;
  lockConflicts: number;
  bookingsConfirmed: number;
  doubleBookings: number;
  at: number;
}

/* ------------------------------------------------------------------ */
/* Venue layouts                                                       */
/* ------------------------------------------------------------------ */

export const layoutRowSchema = z.object({
  label: z.string().min(1).max(3),
  seats: z.number().int().min(1).max(60),
  tier: z.enum(TIERS),
  gapsAfter: z.array(z.number().int().min(1)).default([]),
});

export const layoutSectionSchema = z.object({
  name: z.string().min(1).max(40),
  rows: z.array(layoutRowSchema).min(1).max(40),
});

export const venueLayoutSchema = z.object({
  sections: z.array(layoutSectionSchema).min(1).max(8),
});

export type LayoutRow = z.infer<typeof layoutRowSchema>;
export type LayoutSection = z.infer<typeof layoutSectionSchema>;
export type VenueLayout = z.infer<typeof venueLayoutSchema>;

export interface GeneratedSeat {
  section: string;
  row: string;
  number: number;
  tier: Tier;
  x: number;
  y: number;
}

/** Turns a layout description into positioned seats (grid units). Rows are centred. */
export function generateSeats(layout: VenueLayout): GeneratedSeat[] {
  const rowWidth = (r: LayoutRow) => r.seats + r.gapsAfter.filter((g) => g < r.seats).length;
  const maxWidth = Math.max(1, ...layout.sections.flatMap((s) => s.rows.map(rowWidth)));
  const seats: GeneratedSeat[] = [];
  let y = 0;
  layout.sections.forEach((section, si) => {
    if (si > 0) y += 1; // walkway between sections
    for (const row of section.rows) {
      const offset = Math.floor((maxWidth - rowWidth(row)) / 2);
      let x = offset;
      const gaps = new Set(row.gapsAfter);
      for (let n = 1; n <= row.seats; n++) {
        seats.push({ section: section.name, row: row.label, number: n, tier: row.tier, x, y });
        x += 1;
        if (gaps.has(n) && n < row.seats) x += 1;
      }
      y += 1;
    }
  });
  return seats;
}

export function seatLabel(s: Pick<SeatDTO, 'row' | 'number'>) {
  return `${s.row}${s.number}`;
}

/* ------------------------------------------------------------------ */
/* Pricing (all amounts in paise)                                      */
/* ------------------------------------------------------------------ */

export interface PriceBreakdown {
  subtotal: number;
  fees: number;
  tax: number;
  total: number;
}

export function priceBreakdown(subtotal: number): PriceBreakdown {
  const fees = Math.round(subtotal * FEE_RATE);
  const tax = Math.round(fees * GST_RATE);
  return { subtotal, fees, tax, total: subtotal + fees + tax };
}

export function tierPrice(
  show: Pick<ShowDTO, 'priceRegular' | 'pricePremium' | 'priceVip'>,
  tier: Tier,
): number {
  if (tier === 'VIP') return show.priceVip;
  if (tier === 'PREMIUM') return show.pricePremium;
  return show.priceRegular;
}

/* ------------------------------------------------------------------ */
/* Request schemas                                                     */
/* ------------------------------------------------------------------ */

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex colour like #7C5CFF');

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[0-9]/, 'Add a number'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  avatarColor: hexColor.optional(),
});

export const eventQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.enum(CATEGORIES).optional(),
  city: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sort: z.enum(['date', 'price_asc', 'price_desc', 'newest', 'popular']).default('date'),
  drops: z.enum(['true', 'false']).optional(),
  mine: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type EventQuery = z.infer<typeof eventQuerySchema>;

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(CATEGORIES),
  bannerUrl: z.string().url(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'CANCELLED']).default('DRAFT'),
});
export const updateEventSchema = createEventSchema.partial();

export const createShowSchema = z
  .object({
    venueId: z.string().min(1),
    startsAt: z.string().datetime(),
    priceRegular: z.number().int().min(0),
    pricePremium: z.number().int().min(0),
    priceVip: z.number().int().min(0),
    isDrop: z.boolean().default(false),
    saleOpensAt: z.string().datetime().nullable().optional(),
    admitPerMinute: z.number().int().min(1).max(10000).default(60),
  })
  .refine((v) => !v.isDrop || !!v.saleOpensAt, {
    message: 'Drops need a sale-open time',
    path: ['saleOpensAt'],
  });
export const updateShowSchema = z.object({
  startsAt: z.string().datetime().optional(),
  priceRegular: z.number().int().min(0).optional(),
  pricePremium: z.number().int().min(0).optional(),
  priceVip: z.number().int().min(0).optional(),
  isDrop: z.boolean().optional(),
  saleOpensAt: z.string().datetime().nullable().optional(),
  admitPerMinute: z.number().int().min(1).max(10000).optional(),
});

export const createVenueSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(40),
  address: z.string().trim().min(3).max(200),
  layout: venueLayoutSchema.optional(),
});

export const lockSeatsSchema = z.object({
  seatIds: z.array(z.string().min(1)).min(1).max(MAX_SEATS_PER_USER),
  groupCode: z.string().length(6).optional(),
});

export const createGroupSchema = z.object({ showId: z.string().min(1) });

export const checkoutOrderSchema = z
  .object({
    holdId: z.string().optional(),
    groupCode: z.string().length(6).optional(),
  })
  .refine((v) => !!v.holdId !== !!v.groupCode, { message: 'Provide either holdId or groupCode' });

export const confirmPaymentSchema = z.object({
  bookingId: z.string().min(1),
  providerOrderId: z.string().min(1),
  providerPaymentId: z.string().min(1),
  signature: z.string().optional(),
});

export const checkinSchema = z.object({ token: z.string().min(10) });

export const roleChangeSchema = z.object({ role: z.enum(ROLES) });

export const chatSchema = z.object({ text: z.string().trim().min(1).max(500) });

export const REACTION_EMOJIS = ['🔥', '😂', '👍', '🎉', '😮'] as const;
