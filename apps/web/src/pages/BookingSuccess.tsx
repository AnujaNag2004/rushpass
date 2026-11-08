import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { CalendarPlus, PartyPopper, Ticket } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { BookingDTO } from '@rushpass/shared';
import { GradientMesh } from '../components/Brand';
import { TicketView } from '../components/TicketView';
import { Button } from '../components/ui/Button';
import { EmptyState, PageLoader } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';

function burst() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#7C5CFF', '#FF4D8D', '#FFB547', '#2EE6A6'];
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors });
  setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.6 }, colors }), 250);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.6 }, colors }), 400);
}

function calendarLink(b: BookingDTO) {
  const start = new Date(b.show.startsAt);
  const end = new Date(start.getTime() + 3 * 3600_000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: b.show.event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: `${b.show.venue.name}, ${b.show.venue.city}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export default function BookingSuccessPage() {
  const { id } = useParams();
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useQuery({ queryKey: ['booking', id], queryFn: () => api.get<BookingDTO>(`/bookings/${id}`) });

  useEffect(() => {
    if (data?.status === 'CONFIRMED') burst();
  }, [data?.status]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <EmptyState title="Booking not found" body={errorMessage(error)} />;

  return (
    <div className="relative isolate overflow-hidden">
      <GradientMesh />
      <div className="container-page py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signature text-white shadow-glow">
            <PartyPopper className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-4xl font-bold md:text-5xl">
            You’re <span className="text-gradient">in!</span>
          </h1>
          <p className="mt-2 text-muted">Your tickets are confirmed and on their way to {user?.email}.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 30, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.15, type: 'spring', damping: 18 }} className="mt-10">
          <TicketView booking={data} holder={user?.name} />
        </motion.div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/bookings">
            <Button variant="gradient" icon={<Ticket className="h-4 w-4" />}>My tickets</Button>
          </Link>
          <a href={calendarLink(data)} target="_blank" rel="noreferrer">
            <Button variant="outline" icon={<CalendarPlus className="h-4 w-4" />}>Add to calendar</Button>
          </a>
          {data.groupCode && (
            <Link to={`/group/${data.groupCode}`}>
              <Button variant="ghost">Back to group room</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
