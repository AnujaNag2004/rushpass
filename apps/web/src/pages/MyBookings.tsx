import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronRight, MapPin, QrCode, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { BookingDTO } from '@rushpass/shared';
import { seatLabel } from '@rushpass/shared';
import { Banner, Perforation } from '../components/Booking';
import { Button } from '../components/ui/Button';
import { Badge, EmptyState, Skeleton, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { cn, dayParts, formatTime, rupees } from '../lib/format';

type Tab = 'upcoming' | 'past' | 'cancelled';

export default function MyBookingsPage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  const { data, isLoading } = useQuery({ queryKey: ['bookings', 'me'], queryFn: () => api.get<BookingDTO[]>('/bookings/me') });

  const now = Date.now();
  const groups: Record<Tab, BookingDTO[]> = {
    upcoming: (data ?? []).filter((b) => b.status === 'CONFIRMED' && new Date(b.show.startsAt).getTime() >= now),
    past: (data ?? []).filter((b) => b.status === 'CONFIRMED' && new Date(b.show.startsAt).getTime() < now).reverse(),
    cancelled: (data ?? []).filter((b) => b.status === 'CANCELLED'),
  };
  const list = groups[tab];

  return (
    <div className="container-page py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">My tickets</h1>
          <p className="mt-1 text-muted">Everything you’ve booked, ready to scan at the door.</p>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
            { value: 'past', label: 'Past', count: groups.past.length },
            { value: 'cancelled', label: 'Cancelled', count: groups.cancelled.length },
          ]}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
        {list.map((b, i) => (
          <BookingCard key={b.id} booking={b} index={i} dim={tab !== 'upcoming'} />
        ))}
      </div>

      {!isLoading && !list.length && (
        <EmptyState
          title={tab === 'upcoming' ? 'No upcoming shows yet' : tab === 'past' ? 'No past shows' : 'Nothing cancelled'}
          body={tab === 'upcoming' ? 'Your next favourite night out is one tap away.' : undefined}
          action={
            tab === 'upcoming' ? (
              <Link to="/explore">
                <Button variant="gradient">Find a show</Button>
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function BookingCard({ booking: b, index, dim }: { booking: BookingDTO; index: number; dim?: boolean }) {
  const d = dayParts(b.show.startsAt);
  const seats = b.tickets.length ? b.tickets.map((t) => t.seat) : b.heldSeats ?? [];
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Link to={`/tickets/${b.id}`} className={cn('card card-hover group block overflow-hidden !bg-surface', dim && 'opacity-75')}>
        <div className="relative h-32 overflow-hidden">
          <Banner src={b.show.event.bannerUrl} alt="" className={cn('h-full w-full transition duration-700 group-hover:scale-105', dim && 'grayscale')} />
          <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
          <div className="absolute right-3 top-3 flex gap-1.5">
            {b.groupCode && (
              <Badge tone="primary" className="backdrop-blur">
                <Users className="h-3 w-3" /> Group
              </Badge>
            )}
            {b.status === 'CANCELLED' && <Badge tone="danger">Cancelled</Badge>}
            {b.tickets.some((t) => t.checkedInAt) && <Badge tone="success">Used</Badge>}
          </div>
        </div>
        <div className="flex gap-4 px-5 pb-4">
          <div className="-mt-6 flex w-14 shrink-0 flex-col items-center rounded-xl border border-border bg-surface py-1.5 shadow-card">
            <span className="text-[10px] font-semibold tracking-wider text-accent">{d.month}</span>
            <span className="font-display text-2xl font-bold leading-tight">{d.day}</span>
            <span className="text-[10px] text-muted">{formatTime(b.show.startsAt)}</span>
          </div>
          <div className="min-w-0 pt-2">
            <h3 className="truncate font-display text-lg font-semibold">{b.show.event.title}</h3>
            <p className="flex items-center gap-1 truncate text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {b.show.venue.name}
            </p>
          </div>
        </div>
        <Perforation />
        <div className="flex items-center justify-between px-5 pb-4 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {seats.slice(0, 4).map((s) => (
              <span key={s.id} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-xs font-bold">
                {seatLabel(s)}
              </span>
            ))}
            {seats.length > 4 && <span className="text-xs text-muted">+{seats.length - 4}</span>}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{rupees(b.total)}</span>
            {b.status === 'CONFIRMED' ? <QrCode className="h-5 w-5 text-primary" /> : <ChevronRight className="h-4 w-4 text-muted" />}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
