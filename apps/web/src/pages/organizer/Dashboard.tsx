import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, IndianRupee, LayoutGrid, Plus, Ticket, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { EventDTO, VenueDTO } from '@rushpass/shared';
import { CITIES } from '@rushpass/shared';
import { Banner } from '../../components/Booking';
import { RevenueChart, TierChart } from '../../components/Charts';
import { Button } from '../../components/ui/Button';
import { Badge, Card, EmptyState, Input, Modal, Select, Skeleton, StatCard } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { compactRupees, formatDateTime, rupees } from '../../lib/format';

interface OrganizerStats {
  events: number;
  upcomingShows: number;
  revenue: number;
  ticketsSold: number;
  salesByDay: { day: string; revenue: number; bookings: number }[];
  tiers: { tier: string; sold: number; revenue: number }[];
  topEvents: { id: string; title: string; slug: string; sold: number; revenue: number }[];
}

export default function OrganizerDashboard() {
  const navigate = useNavigate();
  const stats = useQuery({ queryKey: ['organizer-stats'], queryFn: () => api.get<OrganizerStats>('/organizer/stats') });
  const events = useQuery({ queryKey: ['events', 'mine'], queryFn: () => api.list<EventDTO>('/events?mine=true&pageSize=50&sort=newest') });
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => api.get<VenueDTO[]>('/venues') });
  const [venueModal, setVenueModal] = useState(false);
  const [venue, setVenue] = useState({ name: '', city: CITIES[0] as string, address: '' });
  const [creating, setCreating] = useState(false);

  const createVenue = async () => {
    setCreating(true);
    try {
      const v = await api.post<VenueDTO>('/venues', venue);
      toast.success('Venue created — now design its seat map');
      navigate(`/organizer/venues/${v.id}/builder`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const s = stats.data;
  return (
    <div className="container-page py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Organizer studio</h1>
          <p className="mt-1 text-muted">Your shows, sales and seat maps at a glance.</p>
        </div>
        <Link to="/organizer/events/new">
          <Button variant="gradient" icon={<Plus className="h-4 w-4" />}>New event</Button>
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {s ? (
          <>
            <StatCard label="Revenue" value={compactRupees(s.revenue)} icon={<IndianRupee className="h-4 w-4" />} tone="primary" sub={rupees(s.revenue)} />
            <StatCard label="Tickets sold" value={s.ticketsSold.toLocaleString('en-IN')} icon={<Ticket className="h-4 w-4" />} tone="accent" />
            <StatCard label="Events" value={s.events} icon={<CalendarDays className="h-4 w-4" />} tone="gold" />
            <StatCard label="Upcoming shows" value={s.upcomingShows} icon={<TrendingUp className="h-4 w-4" />} tone="success" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <h2 className="font-semibold">Sales · last 14 days</h2>
          {s ? <RevenueChart data={s.salesByDay} /> : <Skeleton className="mt-4 h-60" />}
        </Card>
        <Card className="min-w-0 p-5">
          <h2 className="font-semibold">Tickets by tier</h2>
          {s ? <TierChart data={s.tiers} /> : <Skeleton className="mt-4 h-52" />}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Your events</h2>
            <span className="text-sm text-muted">{events.data?.meta.total ?? 0} total</span>
          </div>
          <div className="mt-4 divide-y divide-border">
            {events.isLoading && <Skeleton className="h-40" />}
            {events.data?.data.map((e) => (
              <Link key={e.id} to={`/organizer/events/${e.id}`} className="flex items-center gap-4 py-3 transition hover:bg-surface-2/40 sm:px-2">
                <Banner src={e.bannerUrl} alt="" className="h-12 w-16 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.title}</div>
                  <div className="text-xs text-muted">{e.nextShowAt ? formatDateTime(e.nextShowAt) : 'No shows yet'}</div>
                </div>
                <div className="hidden w-32 sm:block">
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-signature" style={{ width: `${Math.round((e.soldRatio ?? 0) * 100)}%` }} />
                  </div>
                  <div className="mt-1 text-right text-[11px] text-muted">{Math.round((e.soldRatio ?? 0) * 100)}% sold</div>
                </div>
                <Badge tone={e.status === 'PUBLISHED' ? 'success' : e.status === 'DRAFT' ? 'muted' : 'danger'}>{e.status}</Badge>
              </Link>
            ))}
            {events.data && !events.data.data.length && (
              <EmptyState art="stage" title="No events yet" action={<Link to="/organizer/events/new"><Button variant="gradient">Create your first event</Button></Link>} />
            )}
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          <Card className="min-w-0 p-5">
            <h2 className="font-semibold">Top sellers</h2>
            <ol className="mt-4 space-y-3">
              {s?.topEvents.map((e, i) => (
                <li key={e.id} className="flex items-center gap-3 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-xs font-bold">{i + 1}</span>
                  <Link to={`/events/${e.slug}`} className="min-w-0 flex-1 truncate hover:text-primary">
                    {e.title}
                  </Link>
                  <span className="font-mono text-xs text-muted">{compactRupees(e.revenue)}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card className="min-w-0 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Venues</h2>
              <Button variant="ghost" size="sm" onClick={() => setVenueModal(true)} icon={<Plus className="h-4 w-4" />}>
                Add
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {venues.data?.map((v) => (
                <li key={v.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
                  <Building2 className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{v.name}</div>
                    <div className="text-xs text-muted">
                      {v.city} · {v.capacity} seats
                    </div>
                  </div>
                  <Link to={`/organizer/venues/${v.id}/builder`} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-text" aria-label={`Edit layout of ${v.name}`}>
                    <LayoutGrid className="h-4 w-4" />
                  </Link>
                </li>
              ))}
              {venues.data && !venues.data.length && <li className="text-sm text-muted">Add a venue before creating shows.</li>}
            </ul>
          </Card>
        </div>
      </div>

      <Modal open={venueModal} onClose={() => setVenueModal(false)} title="New venue">
        <div className="space-y-4">
          <Input label="Name" value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} placeholder="The Velvet Hall" />
          <Select label="City" value={venue.city} onChange={(e) => setVenue({ ...venue, city: e.target.value })}>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input label="Address" value={venue.address} onChange={(e) => setVenue({ ...venue, address: e.target.value })} />
          <p className="text-xs text-muted">It starts with a default 84-seat layout. You’ll customise it in the builder next.</p>
          <Button variant="gradient" className="w-full" loading={creating} disabled={venue.name.length < 2 || venue.address.length < 3} onClick={createVenue}>
            Create & open builder
          </Button>
        </div>
      </Modal>
    </div>
  );
}
