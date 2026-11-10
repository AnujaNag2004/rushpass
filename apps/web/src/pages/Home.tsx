import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowRight, Flame, MapPin, Search, ShieldCheck, Sparkles, Timer, Users, Zap } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventDTO } from '@rushpass/shared';
import { CATEGORIES, CITIES } from '@rushpass/shared';
import { AvatarStack, GradientMesh } from '../components/Brand';
import { Banner, EventCard, Perforation } from '../components/Booking';
import { Button } from '../components/ui/Button';
import { Badge, Skeleton } from '../components/ui';
import { useCountdown } from '../hooks/useCountdown';
import { api } from '../lib/api';
import { CATEGORY_EMOJI, CATEGORY_LABEL, cn, duration, formatDateTime } from '../lib/format';

export function HomePage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');

  const popular = useQuery({ queryKey: ['events', 'popular'], queryFn: () => api.list<EventDTO>('/events?sort=popular&pageSize=8') });
  const drops = useQuery({ queryKey: ['events', 'drops'], queryFn: () => api.list<EventDTO>('/events?drops=true&pageSize=4') });

  const search = (e: FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (city) p.set('city', city);
    navigate(`/explore?${p}`);
  };

  return (
    <div>
      {/* ------------------------------- Hero ------------------------------- */}
      <section className="relative isolate overflow-hidden">
        <GradientMesh intense />
        <div className="container-page grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Badge tone="accent" className="!normal-case !tracking-normal">
                <Sparkles className="h-3 w-3" /> New: book with friends in a live room
              </Badge>
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="mt-5 text-[clamp(2.6rem,7vw,5rem)] font-bold leading-[0.95]"
            >
              Get in before <span className="text-gradient">the rush.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5 max-w-xl text-lg text-muted">
              Real-time seat maps, a fair waiting room for big drops, and group rooms where your whole crew picks seats together and pays their own share.
            </motion.p>

            <motion.form
              onSubmit={search}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass mt-8 flex flex-col gap-2 rounded-2xl p-2 shadow-card sm:flex-row"
            >
              <label className="flex flex-1 items-center gap-2 px-3">
                <Search className="h-5 w-5 shrink-0 text-muted" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search concerts, comedy, movies…"
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted/80"
                  aria-label="Search events"
                />
              </label>
              <label className="flex items-center gap-2 border-border px-3 sm:border-l">
                <MapPin className="h-4 w-4 text-muted" />
                <select value={city} onChange={(e) => setCity(e.target.value)} className="h-11 bg-transparent text-sm outline-none" aria-label="City">
                  <option value="">All cities</option>
                  {CITIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <Button type="submit" variant="gradient" className="sm:w-auto">
                Find shows
              </Button>
            </motion.form>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="mt-5 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <Link key={c} to={`/explore?category=${c}`} className="chip">
                  <span>{CATEGORY_EMOJI[c]}</span> {CATEGORY_LABEL[c]}
                </Link>
              ))}
            </motion.div>
          </div>

          <HeroVisual event={popular.data?.data[0]} />
        </div>
      </section>

      {/* ------------------------------ Stats ------------------------------- */}
      <section className="border-y border-border bg-surface/40">
        <div className="container-page grid grid-cols-2 gap-6 py-8 md:grid-cols-4">
          {[
            { icon: ShieldCheck, k: '0', v: 'double bookings, guaranteed' },
            { icon: Zap, k: '<100ms', v: 'live seat sync' },
            { icon: Users, k: '8', v: 'friends per group room' },
            { icon: Timer, k: 'Fair', v: 'randomised drop queue' },
          ].map(({ icon: Icon, k, v }) => (
            <div key={v} className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <div className="font-display text-xl font-bold">{k}</div>
                <div className="text-xs text-muted">{v}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* --------------------------- Selling fast --------------------------- */}
      <section className="container-page mt-20">
        <SectionHeader icon={<Flame className="h-5 w-5 text-accent" />} title="Selling fast" link="/explore?sort=popular" />
        <div className="-mx-4 mt-6 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {popular.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[380px] w-[290px] shrink-0" />)
            : popular.data?.data.map((e, i) => (
                <div key={e.id} className="w-[290px] shrink-0 snap-start">
                  <EventCard event={e} index={i} />
                </div>
              ))}
        </div>
      </section>

      {/* --------------------------- Upcoming drops ------------------------- */}
      <section className="container-page mt-16">
        <SectionHeader icon={<Zap className="h-5 w-5 text-gold" />} title="Upcoming drops" link="/explore?drops=true" />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {drops.isLoading && <Skeleton className="h-48" />}
          {drops.data?.data.map((e) => <DropCard key={e.id} event={e} />)}
          {drops.data && !drops.data.data.length && <p className="text-muted">No drops scheduled right now.</p>}
        </div>
      </section>

      {/* ------------------------- Book with friends ------------------------ */}
      <section className="container-page mt-24">
        <div className="relative isolate overflow-hidden rounded-[28px] border border-border bg-surface p-8 md:p-12">
          <GradientMesh className="opacity-70" />
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <Badge tone="primary">Star feature</Badge>
              <h2 className="mt-4 text-3xl font-bold md:text-4xl">
                One link. Everyone picks. <span className="text-gradient">Everyone pays their share.</span>
              </h2>
              <p className="mt-4 text-muted">
                Create a group room, share the code and watch your friends pick seats live in their own colour. Lock in together, split the bill, and nobody fronts the money for the whole gang.
              </p>
              <Link to="/explore" className="mt-6 inline-block">
                <Button variant="gradient" icon={<Users className="h-4 w-4" />}>Start a group room</Button>
              </Link>
            </div>
            <ol className="grid gap-3">
              {[
                ['Create a room', 'Pick a show and tap “Book with friends”. You get a 6-letter code.'],
                ['Pick seats together', 'Everyone sees everyone’s picks and cursors live on the same map.'],
                ['Lock in & split', 'Each friend pays their own share. Unpaid seats go back on sale when the timer ends.'],
              ].map(([t, b], i) => (
                <motion.li
                  key={t}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="glass flex gap-4 rounded-2xl p-4"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-signature font-display font-bold text-white">{i + 1}</span>
                  <div>
                    <div className="font-semibold">{t}</div>
                    <div className="text-sm text-muted">{b}</div>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---------------------------- Organizers ---------------------------- */}
      <section className="container-page mt-20">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-border bg-surface-2/50 p-8 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold">Running a show?</h2>
            <p className="mt-1 text-muted">Design your seat map, schedule drops and watch occupancy fill up live.</p>
          </div>
          <Link to="/organizer">
            <Button variant="outline" icon={<ArrowRight className="h-4 w-4" />}>Organizer dashboard</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ icon, title, link }: { icon: React.ReactNode; title: string; link: string }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="flex items-center gap-2 text-2xl font-bold md:text-3xl">
        {icon}
        {title}
      </h2>
      <Link to={link} className="group flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
        See all <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

function DropCard({ event }: { event: EventDTO }) {
  const left = useCountdown(event.nextDropAt ?? null, 1000);
  const open = left === 0;
  return (
    <Link to={`/events/${event.slug}`} className="card card-hover group flex overflow-hidden">
      <div className="relative w-2/5 shrink-0 overflow-hidden">
        <Banner src={event.bannerUrl} alt={event.title} className="h-full w-full transition duration-700 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <Badge tone="gold">
            <Zap className="h-3 w-3" /> Ticket drop
          </Badge>
          <h3 className="mt-2 font-display text-lg font-semibold leading-snug">{event.title}</h3>
          <p className="mt-1 text-sm text-muted">{event.nextShowAt && formatDateTime(event.nextShowAt)}</p>
        </div>
        <div className="mt-4">
          <div className="text-[11px] uppercase tracking-wider text-muted">{open ? 'Sale is live' : 'Sale opens in'}</div>
          <div className={cn('font-mono text-2xl font-bold tabular-nums', open ? 'text-success' : 'text-gradient')}>
            {open ? 'Join the queue →' : left != null ? duration(left / 1000) : '—'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function HeroVisual({ event }: { event?: EventDTO }) {
  const seats = Array.from({ length: 6 * 10 });
  const picks: Record<number, string> = { 23: '#7C5CFF', 24: '#FF4D8D', 25: '#FFB547', 26: '#2EE6A6' };
  const booked = new Set([2, 3, 11, 12, 17, 31, 38, 39, 44, 45, 46, 52, 57]);
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95, rotate: 2 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.2, type: 'spring', damping: 20 }} className="relative mx-auto w-full max-w-md">
      <div className="card overflow-hidden !bg-surface p-0 shadow-glow">
        <div className="relative h-32 overflow-hidden">
          {event ? <Banner src={event.bannerUrl} alt="" className="h-full w-full" /> : <div className="h-full bg-signature" />}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted">Group room</div>
              <div className="font-mono text-lg font-bold tracking-widest">RX7K2P</div>
            </div>
            <AvatarStack
              size={30}
              people={[
                { name: 'Aarav Shah', color: '#7C5CFF', online: true },
                { name: 'Meera Iyer', color: '#FF4D8D', online: true },
                { name: 'Rohan Gupta', color: '#FFB547', online: true },
                { name: 'Ananya Rao', color: '#2EE6A6', online: false },
              ]}
            />
          </div>
        </div>
        <div className="p-5">
          <div className="mx-auto mb-3 h-1.5 w-2/3 rounded-full bg-signature opacity-80" />
          <div className="grid grid-cols-10 gap-1.5">
            {seats.map((_, i) => (
              <motion.span
                key={i}
                className={cn('aspect-square rounded-[4px] border', booked.has(i) ? 'border-transparent bg-border' : 'border-success/60 bg-surface-2')}
                style={picks[i] ? { background: picks[i], borderColor: 'transparent' } : undefined}
                animate={picks[i] ? { scale: [1, 1.3, 1] } : undefined}
                transition={picks[i] ? { delay: 0.8 + (i - 23) * 0.35, duration: 0.4, repeat: Infinity, repeatDelay: 4 } : undefined}
              />
            ))}
          </div>
        </div>
        <Perforation />
        <div className="flex items-center justify-between p-5">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted">Seats held for</div>
            <div className="font-mono text-2xl font-bold">06:42</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-muted">Meera picked</div>
            <div className="font-semibold text-accent">F12</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
