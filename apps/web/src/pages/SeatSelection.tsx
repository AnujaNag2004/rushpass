import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Info, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { CheckoutOrderDTO, HoldDTO, SeatDTO, SeatState } from '@rushpass/shared';
import { MAX_SEATS_PER_USER, SOLO_HOLD_MS, priceBreakdown, seatLabel } from '@rushpass/shared';
import { CountdownTimer, PriceBreakdown } from '../components/Booking';
import { SeatLegend, SeatMap, TIER_COLOR } from '../components/SeatMap';
import { Button } from '../components/ui/Button';
import { Card, EmptyState, PageLoader } from '../components/ui';
import { useShowSeats } from '../hooks/useShowSeats';
import { ApiError, api, errorMessage } from '../lib/api';
import { formatDateTime, rupees } from '../lib/format';
import { useAuth } from '../store/auth';

export default function SeatSelectionPage() {
  const { id: showId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const { data, isLoading, error } = useShowSeats(showId);
  const [hold, setHold] = useState<HoldDTO | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [checkingOut, setCheckingOut] = useState(false);

  // Restore an active hold after a refresh.
  const existing = useQuery({
    queryKey: ['my-hold', showId],
    queryFn: () => api.get<HoldDTO | null>(`/shows/${showId}/holds/me`),
    enabled: !!showId,
    staleTime: 0,
  });
  useEffect(() => {
    if (existing.data !== undefined) setHold(existing.data);
  }, [existing.data]);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.code === 'NOT_ADMITTED') {
        toast.info('This is a drop — taking you to the waiting room');
        navigate(`/shows/${showId}/waiting-room`);
        return;
      }
      toast.error(errorMessage(err));
    },
    [navigate, showId],
  );

  const toggle = async (seat: SeatDTO, state: SeatState | undefined) => {
    if (pending.has(seat.id)) return;
    const mine = state?.status === 'HELD' && state.userId === user?.id;
    if (!mine && hold && hold.seats.length >= MAX_SEATS_PER_USER) {
      toast.error(`You can hold up to ${MAX_SEATS_PER_USER} seats`);
      return;
    }
    setPending((p) => new Set(p).add(seat.id));
    try {
      if (mine && hold) {
        await api.post(`/holds/${hold.holdId}/release`, { seatIds: [seat.id] });
        const rest = hold.seats.filter((s) => s.id !== seat.id);
        setHold(rest.length ? { ...hold, seats: rest } : null);
      } else {
        setHold(await api.post<HoldDTO>(`/shows/${showId}/holds`, { seatIds: [seat.id] }));
      }
    } catch (err) {
      handleError(err);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(seat.id);
        return n;
      });
    }
  };

  const onExpire = useCallback(() => {
    toast.warning('Your hold expired and the seats went back on sale.');
    setHold(null);
    qc.invalidateQueries({ queryKey: ['seats', showId] });
  }, [qc, showId]);

  const checkout = async () => {
    if (!hold) return;
    setCheckingOut(true);
    try {
      const key = `${hold.holdId}:${hold.seats.map((s) => s.id).sort().join(',')}`;
      const order = await api.post<CheckoutOrderDTO>('/checkout/orders', { holdId: hold.holdId }, { 'Idempotency-Key': key });
      navigate(`/checkout/${order.bookingId}`);
    } catch (err) {
      handleError(err);
    } finally {
      setCheckingOut(false);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !data) return <EmptyState art="stage" title="Show not found" body={errorMessage(error)} />;

  const { show } = data;
  const prices = { REGULAR: show.priceRegular, PREMIUM: show.pricePremium, VIP: show.priceVip };
  const breakdown = priceBreakdown(hold?.seats.reduce((s, x) => s + x.price, 0) ?? 0);

  return (
    <div className="container-page py-6 pb-40 lg:pb-10">
      <Link to={`/events/${show.event.slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> {show.event.title}
      </Link>
      <div className="mt-2 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Choose your seats</h1>
          <p className="text-muted">
            {show.venue.name} · {formatDateTime(show.startsAt)} ·{' '}
            <span className="font-mono text-text">{show.seatsLeft}</span> left
          </p>
        </div>
        {hold && <CountdownTimer expiresAt={hold.expiresAt} total={SOLO_HOLD_MS} onExpire={onExpire} />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="min-w-0 p-3 sm:p-5">
          <SeatMap seats={data.seats} states={data.states} myUserId={user?.id} pending={pending} prices={prices} onSeatClick={toggle} />
          <SeatLegend className="mt-4 border-t border-border pt-4" />
        </Card>

        <aside className="hidden lg:block">
          <Card className="sticky top-24 p-5">
            <Summary hold={hold} breakdown={breakdown} onRemove={(s) => toggle(s, { seatId: s.id, status: 'HELD', userId: user?.id })} />
            <Button variant="gradient" size="lg" className="mt-5 w-full" disabled={!hold?.seats.length} loading={checkingOut} onClick={checkout}>
              Continue to pay <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Seats are held for 5 minutes once you pick them. Nobody else can take them while the timer runs.
            </p>
          </Card>
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <AnimatePresence>
        {!!hold?.seats.length && (
          <motion.div initial={{ y: 120 }} animate={{ y: 0 }} exit={{ y: 120 }} className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 p-4 lg:hidden">
            <div className="container-page flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-muted">{hold.seats.map(seatLabel).join(', ')}</div>
                <div className="font-display text-xl font-bold">{rupees(breakdown.total, { decimals: true })}</div>
              </div>
              <Button variant="gradient" loading={checkingOut} onClick={checkout}>
                Pay <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Summary({ hold, breakdown, onRemove }: { hold: HoldDTO | null; breakdown: ReturnType<typeof priceBreakdown>; onRemove: (s: SeatDTO) => void }) {
  return (
    <div>
      <h2 className="font-semibold">Your seats</h2>
      {!hold?.seats.length ? (
        <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">Tap any glowing seat to grab it.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          <AnimatePresence initial={false}>
            {hold.seats.map((s) => (
              <motion.li key={s.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="flex items-center gap-3 rounded-xl bg-surface-2/70 px-3 py-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg font-mono text-xs font-bold text-[#0B0A14]" style={{ background: TIER_COLOR[s.tier] }}>
                  {seatLabel(s)}
                </span>
                <div className="flex-1 text-sm">
                  <div className="font-medium">
                    {s.section} · Row {s.row}
                  </div>
                  <div className="text-xs text-muted">{s.tier}</div>
                </div>
                <span className="font-mono text-sm">{rupees(s.price)}</span>
                <button onClick={() => onRemove(s)} className="rounded-md p-1 text-muted hover:bg-surface hover:text-danger" aria-label={`Remove seat ${seatLabel(s)}`}>
                  <X className="h-4 w-4" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {!!hold?.seats.length && <PriceBreakdown breakdown={breakdown} className="mt-5" />}
    </div>
  );
}
