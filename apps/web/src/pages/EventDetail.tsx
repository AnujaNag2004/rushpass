import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, MapPin, Share2, Ticket, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { EventDTO, GroupStateDTO, ShowDTO } from '@rushpass/shared';
import { SOCKET } from '@rushpass/shared';
import { Banner } from '../components/Booking';
import { Button } from '../components/ui/Button';
import { Badge, EmptyState, PageLoader } from '../components/ui';
import { useCountdown } from '../hooks/useCountdown';
import { useSocketEvent } from '../hooks/useSocket';
import { api, errorMessage } from '../lib/api';
import { getSocket } from '../lib/socket';
import { CATEGORY_LABEL, cn, dayParts, duration, formatDate, formatTime, rupees } from '../lib/format';
import { useAuth } from '../store/auth';

export default function EventDetailPage() {
  const { slug } = useParams();
  const qc = useQueryClient();
  const { data: event, isLoading, error } = useQuery({
    queryKey: ['event', slug],
    queryFn: () => api.get<EventDTO>(`/events/${slug}`),
  });

  // Live "seats left" for every show on this page.
  const showIds = event?.shows?.map((s) => s.id).join(',');
  useEffect(() => {
    if (!showIds) return;
    const socket = getSocket();
    const ids = showIds.split(',');
    const join = () => ids.forEach((id) => socket.emit(SOCKET.SHOW_JOIN, id));
    join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      ids.forEach((id) => socket.emit(SOCKET.SHOW_LEAVE, id));
    };
  }, [showIds]);
  useSocketEvent<{ showId: string; available: number }>(SOCKET.SHOW_AVAILABILITY, ({ showId, available }) => {
    qc.setQueryData<EventDTO>(['event', slug], (prev) =>
      prev ? { ...prev, shows: prev.shows?.map((s) => (s.id === showId ? { ...s, seatsLeft: available } : s)) } : prev,
    );
  });

  if (isLoading) return <PageLoader />;
  if (error || !event) {
    return <EmptyState art="stage" title="Event not found" body={errorMessage(error)} action={<Link to="/explore"><Button variant="outline">Browse events</Button></Link>} />;
  }

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) await navigator.share({ title: event.title, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    }
  };

  return (
    <div>
      <section className="relative isolate h-[46vh] min-h-[340px] overflow-hidden">
        <Banner src={event.bannerUrl} alt={event.title} className="absolute inset-0 -z-10 h-full w-full" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/60 to-bg/10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-primary/25 via-transparent to-accent/20 mix-blend-overlay" />
        <div className="container-page flex h-full flex-col justify-between py-6">
          <div className="flex justify-between">
            <Link to="/explore" className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm">
              <ArrowLeft className="h-4 w-4" /> Explore
            </Link>
            <button onClick={share} className="glass grid h-9 w-9 place-items-center rounded-full" aria-label="Share event">
              <Share2 className="h-4 w-4" />
            </button>
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-wrap gap-2">
              <Badge tone="primary">{CATEGORY_LABEL[event.category]}</Badge>
              {event.hasDrop && (
                <Badge tone="gold">
                  <Zap className="h-3 w-3" /> Ticket drop
                </Badge>
              )}
              {event.status !== 'PUBLISHED' && <Badge tone="danger">{event.status}</Badge>}
            </div>
            <h1 className="mt-3 max-w-4xl text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.02]">{event.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" /> {event.shows?.[0]?.venue.name}, {event.city}
              </span>
              {event.organizer && <span>by {event.organizer.name}</span>}
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[1fr_420px]">
        <div>
          <h2 className="text-xl font-semibold">About</h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{event.description}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Regular', price: Math.min(...(event.shows ?? []).map((s) => s.priceRegular)), cls: 'border-success/40 text-success' },
              { label: 'Premium', price: Math.min(...(event.shows ?? []).map((s) => s.pricePremium)), cls: 'border-accent/40 text-accent' },
              { label: 'VIP', price: Math.min(...(event.shows ?? []).map((s) => s.priceVip)), cls: 'border-gold/40 text-gold' },
            ].map((t) => (
              <div key={t.label} className={cn('rounded-2xl border bg-surface/60 p-4', t.cls)}>
                <div className="text-xs font-semibold uppercase tracking-wider">{t.label}</div>
                <div className="mt-1 font-display text-2xl font-bold text-text">{Number.isFinite(t.price) ? rupees(t.price) : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        <aside>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Calendar className="h-5 w-5 text-primary" /> Pick a show
          </h2>
          <div className="mt-4 space-y-3">
            {event.shows?.length ? (
              event.shows.map((s) => <ShowRow key={s.id} show={s} />)
            ) : (
              <p className="text-muted">No upcoming shows.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ShowRow({ show }: { show: ShowDTO }) {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [creating, setCreating] = useState(false);
  const d = dayParts(show.startsAt);
  const capacity = show.capacity ?? show.venue.capacity;
  const left = show.seatsLeft ?? capacity;
  const pct = capacity ? left / capacity : 0;
  const saleIn = useCountdown(show.isDrop ? show.saleOpensAt : null, 1000);

  const requireLogin = (to: string) => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(to)}`);
      return false;
    }
    return true;
  };

  const book = () => {
    const to = show.isDrop ? `/shows/${show.id}/waiting-room` : `/shows/${show.id}/seats`;
    if (requireLogin(to)) navigate(to);
  };

  const withFriends = async () => {
    if (!requireLogin(window.location.pathname)) return;
    setCreating(true);
    try {
      const room = await api.post<GroupStateDTO>('/groups', { showId: show.id });
      toast.success(`Room ${room.code} created — share the link!`);
      navigate(`/group/${room.code}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.div layout className="card p-4">
      <div className="flex items-start gap-4">
        <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-surface-2 py-2">
          <span className="text-[10px] font-semibold tracking-wider text-accent">{d.month}</span>
          <span className="font-display text-2xl font-bold leading-none">{d.day}</span>
          <span className="mt-0.5 text-[10px] text-muted">{d.weekday}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4 text-muted" /> {formatTime(show.startsAt)}
            {show.isDrop && <Badge tone="gold">Drop</Badge>}
          </div>
          <div className="truncate text-sm text-muted">
            {show.venue.name} · {formatDate(show.startsAt, { year: 'numeric' })}
          </div>
          <div className="mt-2">
            <div className="flex justify-between text-xs">
              <span className={cn('font-medium', pct < 0.2 ? 'text-accent' : 'text-muted')}>
                <motion.span key={left} initial={{ scale: 1.4, color: 'rgb(var(--accent))' }} animate={{ scale: 1, color: 'inherit' }} className="inline-block font-mono">
                  {left}
                </motion.span>{' '}
                seats left
              </span>
              <span className="text-muted">from {rupees(show.priceRegular)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <motion.div className="h-full bg-signature" animate={{ width: `${(1 - pct) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
      {show.isDrop && saleIn != null && saleIn > 0 && (
        <div className="mt-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
          Sale opens in <span className="font-mono font-bold">{duration(saleIn / 1000)}</span> — join the waiting room early for a fair random spot.
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="gradient" onClick={book} disabled={left === 0} icon={<Ticket className="h-4 w-4" />}>
          {left === 0 ? 'Sold out' : show.isDrop ? 'Join queue' : 'Book now'}
        </Button>
        <Button variant="outline" onClick={withFriends} loading={creating} disabled={show.isDrop || left === 0} icon={<Users className="h-4 w-4" />} title={show.isDrop ? 'Group rooms are not available for drops' : undefined}>
          With friends
        </Button>
      </div>
    </motion.div>
  );
}
