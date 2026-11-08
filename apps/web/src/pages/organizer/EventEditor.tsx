import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, ExternalLink, Plus, Save, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import type { EventDTO, ShowDTO, VenueDTO } from '@rushpass/shared';
import { CATEGORIES, createEventSchema } from '@rushpass/shared';
import { Banner } from '../../components/Booking';
import { SeatLegend, SeatMap } from '../../components/SeatMap';
import { Button } from '../../components/ui/Button';
import { Badge, Card, Input, Modal, PageLoader, Select, StatCard } from '../../components/ui';
import { useShowSeats } from '../../hooks/useShowSeats';
import { api, errorMessage } from '../../lib/api';
import { CATEGORY_LABEL, cn, formatDateTime, rupees } from '../../lib/format';

type EventForm = z.input<typeof createEventSchema>;

export default function EventEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedShow, setSelectedShow] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const event = useQuery({ queryKey: ['event', id], queryFn: () => api.get<EventDTO>(`/events/${id}`), enabled: !isNew });
  const form = useForm<EventForm>({
    resolver: zodResolver(createEventSchema),
    defaultValues: { title: '', description: '', category: 'CONCERT', bannerUrl: '', status: 'DRAFT' },
  });

  useEffect(() => {
    if (event.data) {
      const { title, description, category, bannerUrl, status } = event.data;
      form.reset({ title, description, category, bannerUrl, status });
    }
  }, [event.data, form]);

  const save = form.handleSubmit(async (values) => {
    try {
      if (isNew) {
        const created = await api.post<EventDTO>('/events', values);
        toast.success('Event created — now add a show');
        navigate(`/organizer/events/${created.id}`, { replace: true });
      } else {
        await api.patch<EventDTO>(`/events/${id}`, values);
        toast.success('Saved');
        qc.invalidateQueries({ queryKey: ['event', id] });
      }
      qc.invalidateQueries({ queryKey: ['events'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  const remove = async () => {
    try {
      const res = await api.del<{ cancelled?: boolean }>(`/events/${id}`);
      toast.success(res.cancelled ? 'Event cancelled (tickets were sold, so history is kept)' : 'Event deleted');
      qc.invalidateQueries({ queryKey: ['events'] });
      navigate('/organizer');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!isNew && event.isLoading) return <PageLoader />;
  const banner = form.watch('bannerUrl');
  const errors = form.formState.errors;

  return (
    <div className="container-page py-8">
      <Link to="/organizer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Organizer studio
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{isNew ? 'New event' : event.data?.title}</h1>
        {!isNew && event.data && (
          <div className="flex gap-2">
            <Link to={`/events/${event.data.slug}`} target="_blank">
              <Button variant="outline" size="sm" icon={<ExternalLink className="h-4 w-4" />}>View page</Button>
            </Link>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} icon={<Trash2 className="h-4 w-4" />}>
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="p-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
            <Input label="Title" className="sm:col-span-2" {...form.register('title')} error={errors.title?.message} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="description">Description</label>
              <textarea id="description" rows={5} className={cn('input resize-y', errors.description && 'border-danger')} {...form.register('description')} />
              {errors.description && <p className="mt-1.5 text-xs text-danger">{errors.description.message}</p>}
            </div>
            <Select label="Category" {...form.register('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
            <Select label="Status" {...form.register('status')}>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="PUBLISHED">Published</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
            <Input label="Banner image URL" className="sm:col-span-2" placeholder="https://images.unsplash.com/…" {...form.register('bannerUrl')} error={errors.bannerUrl?.message} />
            <div className="sm:col-span-2">
              <Button type="submit" variant="gradient" loading={form.formState.isSubmitting} icon={<Save className="h-4 w-4" />}>
                {isNew ? 'Create event' : 'Save changes'}
              </Button>
            </div>
          </form>
        </Card>
        <Card className="overflow-hidden">
          {banner ? <Banner src={banner} alt="Banner preview" className="aspect-[16/10] w-full" /> : <div className="grid aspect-[16/10] place-items-center bg-surface-2 text-sm text-muted">Banner preview</div>}
          <div className="p-4">
            <div className="font-display text-lg font-semibold">{form.watch('title') || 'Untitled event'}</div>
            <div className="text-sm text-muted">{CATEGORY_LABEL[form.watch('category') ?? 'CONCERT']}</div>
          </div>
        </Card>
      </div>

      {!isNew && event.data && (
        <>
          <ShowsSection event={event.data} selected={selectedShow} onSelect={setSelectedShow} />
          {selectedShow && <Occupancy showId={selectedShow} />}
        </>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete this event?">
        <p className="text-sm text-muted">If tickets were already sold, the event is cancelled instead so booking history is kept.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
          <Button variant="danger" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function ShowsSection({ event, selected, onSelect }: { event: EventDTO; selected: string | null; onSelect: (id: string) => void }) {
  const qc = useQueryClient();
  const venues = useQuery({ queryKey: ['venues'], queryFn: () => api.get<VenueDTO[]>('/venues') });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    venueId: '',
    startsAt: toLocalInput(new Date(Date.now() + 7 * 86_400_000)),
    priceRegular: 499,
    pricePremium: 899,
    priceVip: 1499,
    isDrop: false,
    saleOpensAt: toLocalInput(new Date(Date.now() + 10 * 60_000)),
    admitPerMinute: 60,
  });

  const add = async () => {
    setSaving(true);
    try {
      await api.post<ShowDTO>(`/events/${event.id}/shows`, {
        venueId: f.venueId || venues.data?.[0]?.id,
        startsAt: new Date(f.startsAt).toISOString(),
        priceRegular: Math.round(f.priceRegular * 100),
        pricePremium: Math.round(f.pricePremium * 100),
        priceVip: Math.round(f.priceVip * 100),
        isDrop: f.isDrop,
        saleOpensAt: f.isDrop ? new Date(f.saleOpensAt).toISOString() : null,
        admitPerMinute: f.admitPerMinute,
      });
      toast.success('Show added');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['event', event.id] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Shows</h2>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)} icon={<Plus className="h-4 w-4" />}>
          Add show
        </Button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {event.shows?.map((s) => {
          const cap = s.capacity ?? s.venue.capacity;
          const sold = cap - (s.seatsLeft ?? cap);
          return (
            <button key={s.id} onClick={() => onSelect(s.id)} className={cn('card card-hover p-4 text-left', selected === s.id && 'border-primary shadow-glow')}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{formatDateTime(s.startsAt)}</span>
                {s.isDrop && (
                  <Badge tone="gold">
                    <Zap className="h-3 w-3" /> Drop
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted">{s.venue.name}</div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-signature" style={{ width: `${cap ? (sold / cap) * 100 : 0}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted">
                <span>{sold} / {cap} taken</span>
                <span className="flex items-center gap-1 text-primary">
                  <BarChart3 className="h-3.5 w-3.5" /> Live occupancy
                </span>
              </div>
            </button>
          );
        })}
        {!event.shows?.length && <p className="text-sm text-muted">No shows yet. Add one to start selling.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a show">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Venue" className="sm:col-span-2" value={f.venueId} onChange={(e) => setF({ ...f, venueId: e.target.value })}>
            {venues.data?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.city} ({v.capacity} seats)
              </option>
            ))}
          </Select>
          <Input label="Starts at" type="datetime-local" className="sm:col-span-2" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
          <Input label="Regular (₹)" type="number" min={0} value={f.priceRegular} onChange={(e) => setF({ ...f, priceRegular: Number(e.target.value) })} />
          <Input label="Premium (₹)" type="number" min={0} value={f.pricePremium} onChange={(e) => setF({ ...f, pricePremium: Number(e.target.value) })} />
          <Input label="VIP (₹)" type="number" min={0} value={f.priceVip} onChange={(e) => setF({ ...f, priceVip: Number(e.target.value) })} />
          <label className="flex items-center gap-3 self-end rounded-btn border border-border bg-surface-2 px-3.5 py-2.5 text-sm">
            <input type="checkbox" checked={f.isDrop} onChange={(e) => setF({ ...f, isDrop: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--primary))]" />
            Make it a timed drop
          </label>
          {f.isDrop && (
            <>
              <Input label="Sale opens at" type="datetime-local" value={f.saleOpensAt} onChange={(e) => setF({ ...f, saleOpensAt: e.target.value })} />
              <Input label="Admit per minute" type="number" min={1} value={f.admitPerMinute} onChange={(e) => setF({ ...f, admitPerMinute: Number(e.target.value) })} />
            </>
          )}
          <Button variant="gradient" className="sm:col-span-2" loading={saving} disabled={!venues.data?.length} onClick={add}>
            {venues.data?.length ? 'Add show' : 'Create a venue first'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

interface OccupancyData {
  tiers: { tier: string; total: number; booked: number; held: number }[];
  revenue: number;
}

function Occupancy({ showId }: { showId: string }) {
  const seats = useShowSeats(showId);
  const occ = useQuery({
    queryKey: ['occupancy', showId],
    queryFn: () => api.get<OccupancyData>(`/organizer/shows/${showId}/occupancy`),
    refetchInterval: 10_000,
  });
  if (!seats.data) return <PageLoader />;
  const states = Object.values(seats.data.states);
  const booked = states.filter((s) => s.status === 'BOOKED').length;
  const held = states.filter((s) => s.status === 'HELD').length;
  const total = seats.data.seats.length;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Live occupancy</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Booked" value={`${Math.round((booked / total) * 100)}%`} sub={`${booked} of ${total} seats`} tone="primary" />
        <StatCard label="Held right now" value={held} sub="in someone’s cart" tone="gold" />
        <StatCard label="Available" value={total - booked - held} tone="success" />
        <StatCard label="Revenue" value={rupees(occ.data?.revenue ?? 0)} tone="accent" />
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="min-w-0 p-4">
          <SeatMap seats={seats.data.seats} states={seats.data.states} readOnly />
          <SeatLegend className="mt-4 border-t border-border pt-4" />
        </Card>
        <Card className="h-fit p-5">
          <h3 className="font-semibold">By tier</h3>
          <ul className="mt-4 space-y-4">
            {occ.data?.tiers.map((t) => (
              <li key={t.tier}>
                <div className="flex justify-between text-sm">
                  <span>{t.tier}</span>
                  <span className="font-mono text-muted">
                    {t.booked}/{t.total}
                  </span>
                </div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-signature" style={{ width: `${t.total ? (t.booked / t.total) * 100 : 0}%` }} />
                  <div className="h-full bg-gold/60" style={{ width: `${t.total ? (t.held / t.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
