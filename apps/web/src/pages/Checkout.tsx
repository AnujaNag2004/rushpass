import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Lock, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { BookingDTO, CheckoutOrderDTO } from '@rushpass/shared';
import { GROUP_HOLD_MS, SOLO_HOLD_MS, seatLabel } from '@rushpass/shared';
import { Banner, CountdownTimer, MockPaymentSheet, PriceBreakdown, TicketStub, loadRazorpay } from '../components/Booking';
import { TIER_COLOR } from '../components/SeatMap';
import { Button } from '../components/ui/Button';
import { Badge, Card, EmptyState, PageLoader } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { formatDateTime, rupees } from '../lib/format';
import { useAuth } from '../store/auth';

const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;

export default function CheckoutPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [sheet, setSheet] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [expired, setExpired] = useState(false);

  const { data: booking, isLoading, error, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => api.get<BookingDTO>(`/bookings/${bookingId}`),
  });

  useEffect(() => setExpired(false), [bookingId]);

  const done = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['bookings'] });
    navigate(`/booking/${bookingId}/success`, { replace: true });
  }, [bookingId, navigate, qc]);

  if (isLoading) return <PageLoader />;
  if (error || !booking) return <EmptyState title="Booking not found" body={errorMessage(error)} />;
  if (booking.status === 'CONFIRMED') return <Navigate to={`/booking/${booking.id}/success`} replace />;

  const order: CheckoutOrderDTO | null = booking.payment
    ? {
        bookingId: booking.id,
        provider: booking.payment.provider,
        orderId: booking.payment.orderId,
        amount: booking.total,
        currency: 'INR',
        expiresAt: booking.holdExpiresAt ?? 0,
        breakdown: { subtotal: booking.subtotal, fees: booking.fees, tax: booking.tax, total: booking.total },
      }
    : null;

  const pay = async () => {
    if (!order) return;
    if (order.provider === 'MOCK') {
      setSheet(true);
      return;
    }
    const ok = await loadRazorpay();
    if (!ok || !window.Razorpay) {
      toast.error('Could not load Razorpay. Check your connection.');
      return;
    }
    const rzp = new window.Razorpay({
      key: RAZORPAY_KEY,
      amount: order.amount,
      currency: 'INR',
      name: 'RushPass',
      description: booking.show.event.title,
      order_id: order.orderId,
      prefill: { name: user?.name, email: user?.email },
      theme: { color: '#7C5CFF' },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        try {
          await api.post('/checkout/confirm', {
            bookingId: booking.id,
            providerOrderId: resp.razorpay_order_id,
            providerPaymentId: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
          });
          done();
        } catch (err) {
          toast.error(errorMessage(err));
          refetch();
        }
      },
    });
    rzp.on('payment.failed', () => {
      toast.error('Payment failed. You can try again while your seats are held.');
    });
    rzp.open();
  };

  const retry = async () => {
    setRetrying(true);
    try {
      const next = await api.post<CheckoutOrderDTO>(
        '/checkout/orders',
        booking.groupCode ? { groupCode: booking.groupCode } : { holdId: booking.holdId },
        { 'Idempotency-Key': crypto.randomUUID() },
      );
      navigate(`/checkout/${next.bookingId}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  const seats = booking.heldSeats ?? booking.tickets.map((t) => t.seat);
  const failed = booking.status === 'FAILED' || booking.status === 'CANCELLED';
  const backTo = booking.groupCode ? `/group/${booking.groupCode}` : `/shows/${booking.show.id}/seats`;

  return (
    <div className="container-page max-w-5xl py-8">
      <Link to={backTo} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> {booking.groupCode ? 'Back to group room' : 'Change seats'}
      </Link>
      <h1 className="mt-2 text-3xl font-bold">Checkout</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <TicketStub
          className="min-h-[420px]"
          glow
          stub={
            <div className="grid grid-cols-2 gap-4 p-6 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted">Venue</div>
                <div className="mt-1 font-medium">{booking.show.venue.name}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted">When</div>
                <div className="mt-1 font-medium">{formatDateTime(booking.show.startsAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted">Holder</div>
                <div className="mt-1 font-medium">{user?.name}</div>
              </div>
            </div>
          }
        >
          <div className="relative flex min-h-[280px] flex-1 flex-col">
            <Banner src={booking.show.event.bannerUrl} alt="" className="absolute inset-0 h-full w-full opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/70 to-transparent" />
            <div className="relative mt-auto p-6">
              {booking.groupCode && (
                <Badge tone="primary" className="mb-2 w-fit">
                  <Users className="h-3 w-3" /> Group {booking.groupCode} · your share
                </Badge>
              )}
              <h2 className="text-2xl font-bold">{booking.show.event.title}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {seats.map((s) => (
                  <span key={s.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/80 px-2.5 py-1.5 text-sm backdrop-blur">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[s.tier] }} />
                    <span className="font-mono font-bold">{seatLabel(s)}</span>
                    <span className="text-xs text-muted">{s.section}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </TicketStub>

        <Card className="h-fit p-6">
          {!failed && booking.holdExpiresAt && !expired && (
            <div className="mb-5 rounded-xl bg-surface-2/60 p-3">
              <CountdownTimer
                expiresAt={booking.holdExpiresAt}
                total={booking.groupCode ? GROUP_HOLD_MS : SOLO_HOLD_MS}
                onExpire={() => setExpired(true)}
                label="Pay within"
              />
            </div>
          )}
          <PriceBreakdown breakdown={{ subtotal: booking.subtotal, fees: booking.fees, tax: booking.tax, total: booking.total }} />

          {failed || expired ? (
            <div className="mt-6">
              <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {expired ? 'Your hold expired. The seats went back on sale.' : 'That payment did not go through. Your seats are still held if the timer is running.'}
              </div>
              {!expired ? (
                <Button variant="gradient" size="lg" className="mt-4 w-full" loading={retrying} onClick={retry} icon={<RefreshCw className="h-4 w-4" />}>
                  Try again
                </Button>
              ) : (
                <Link to={backTo}>
                  <Button variant="outline" size="lg" className="mt-4 w-full">
                    Pick seats again
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <Button variant="gradient" size="lg" className="mt-6 w-full" onClick={pay} icon={<Lock className="h-4 w-4" />}>
              Pay {rupees(booking.total, { decimals: true })}
            </Button>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            {order?.provider === 'MOCK' ? 'Test mode — no real money moves' : 'Secured by Razorpay'}
          </p>
        </Card>
      </div>

      <MockPaymentSheet
        open={sheet}
        order={order}
        onClose={() => setSheet(false)}
        onPay={async () => {
          try {
            await api.post(`/checkout/mock/${order!.orderId}/pay`);
            setSheet(false);
            done();
          } catch (err) {
            setSheet(false);
            toast.error(errorMessage(err));
            refetch();
          }
        }}
        onFail={async () => {
          await api.post(`/checkout/mock/${order!.orderId}/fail`).catch(() => undefined);
          setSheet(false);
          toast.error('Payment failed (simulated).');
          refetch();
        }}
      />
    </div>
  );
}
