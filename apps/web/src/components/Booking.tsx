import { motion } from 'framer-motion';
import { ArrowUpRight, CreditCard, Flame, Lock, MapPin, ShieldCheck, Timer, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CheckoutOrderDTO, EventDTO, PriceBreakdown as PB } from '@rushpass/shared';
import { useCountdown } from '../hooks/useCountdown';
import { CATEGORY_LABEL, cn, dayParts, formatTime, mmss, rupees } from '../lib/format';
import { Button } from './ui/Button';
import { Badge, Modal } from './ui';

/* ------------------------------- Banner image ------------------------------ */

export function Banner({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={cn('bg-signature opacity-80', className)} role="img" aria-label={alt} />
  ) : (
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn('object-cover', className)} />
  );
}

/* -------------------------------- TicketStub ------------------------------- */

/** Dashed tear line with two semicircle notches cut into the card edges. */
export function Perforation({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex h-7 items-center', className)} aria-hidden>
      <span className="absolute -left-3.5 h-7 w-7 rounded-full border border-border bg-bg" />
      <div className="perforation mx-5 flex-1" />
      <span className="absolute -right-3.5 h-7 w-7 rounded-full border border-border bg-bg" />
    </div>
  );
}

/** A card shaped like a real ticket: main body, tear-off perforation with notches, and a stub. */
export function TicketStub({
  children,
  stub,
  className,
  glow,
}: {
  children: ReactNode;
  stub?: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div className={cn('relative', glow && 'drop-shadow-[0_20px_40px_rgb(var(--primary)/0.25)]')}>
      <div className={cn('flex flex-col overflow-hidden rounded-card border border-border bg-surface', className)}>
        <div className="relative flex flex-1 flex-col">{children}</div>
        {stub && (
          <>
            <Perforation />
            <div>{stub}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- EventCard ------------------------------- */

export function EventCard({ event, index = 0 }: { event: EventDTO; index?: number }) {
  const d = event.nextShowAt ? dayParts(event.nextShowAt) : null;
  const sellingFast = (event.soldRatio ?? 0) > 0.45;
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: Math.min(index, 8) * 0.04 }}>
      <Link to={`/events/${event.slug}`} className="group block h-full rounded-card focus-visible:outline-offset-4">
        <div className="card card-hover flex h-full flex-col overflow-hidden !bg-surface">
          <div className="relative aspect-[16/10] overflow-hidden">
            <Banner src={event.bannerUrl} alt={event.title} className="h-full w-full transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/10 to-transparent" />
            <div className="absolute left-3 top-3 flex gap-1.5">
              <Badge tone="muted" className="!border-white/10 !bg-black/50 !text-white backdrop-blur">
                {CATEGORY_LABEL[event.category] ?? event.category}
              </Badge>
              {event.hasDrop && (
                <Badge tone="gold" className="backdrop-blur">
                  <Zap className="h-3 w-3" /> Drop
                </Badge>
              )}
            </div>
            {sellingFast && (
              <Badge tone="accent" className="absolute right-3 top-3 backdrop-blur">
                <Flame className="h-3 w-3" /> Selling fast
              </Badge>
            )}
          </div>
          <div className="flex flex-1 gap-4 p-4 pb-2">
            {d && (
              <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-border bg-surface-2 py-1.5">
                <span className="text-[10px] font-semibold tracking-wider text-accent">{d.month}</span>
                <span className="font-display text-xl font-bold leading-tight">{d.day}</span>
                <span className="text-[10px] text-muted">{d.weekday}</span>
              </div>
            )}
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug">{event.title}</h3>
              <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {event.city ?? 'TBA'}
                {event.nextShowAt && <span className="ml-1">· {formatTime(event.nextShowAt)}</span>}
              </p>
            </div>
          </div>
          <Perforation />
          <div className="flex h-[52px] items-center justify-between px-4 pb-1">
            <span className="text-sm text-muted">
              from <span className="font-display text-base font-bold text-text">{rupees(event.minPrice)}</span>
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary transition group-hover:bg-signature group-hover:text-white">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/* ------------------------------ CountdownTimer ----------------------------- */

export function CountdownTimer({
  expiresAt,
  total,
  onExpire,
  size = 'md',
  label = 'Seats held for',
}: {
  expiresAt: number | null | undefined;
  total?: number;
  onExpire?: () => void;
  size?: 'md' | 'lg';
  label?: string;
}) {
  const left = useCountdown(expiresAt);
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
  }, [expiresAt]);
  useEffect(() => {
    if (left === 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [left, onExpire]);
  if (left == null) return null;
  const urgent = left < 60_000;
  const pct = total ? Math.max(0, Math.min(1, left / total)) : 1;
  const r = size === 'lg' ? 34 : 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3" role="timer" aria-live="off" aria-label={`${label} ${mmss(left)}`}>
      <svg width={r * 2 + 8} height={r * 2 + 8} className="-rotate-90">
        <circle cx={r + 4} cy={r + 4} r={r} stroke="rgb(var(--border))" strokeWidth="4" fill="none" />
        <circle
          cx={r + 4}
          cy={r + 4}
          r={r}
          stroke={urgent ? 'rgb(var(--danger))' : 'url(#timer-grad)'}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-300"
        />
        <defs>
          <linearGradient id="timer-grad">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset="1" stopColor="#FF4D8D" />
          </linearGradient>
        </defs>
      </svg>
      <div>
        <div className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
          <Timer className="h-3 w-3" /> {label}
        </div>
        <div className={cn('font-mono font-bold tabular-nums', size === 'lg' ? 'text-4xl' : 'text-xl', urgent && 'animate-pulse-red')}>{mmss(left)}</div>
      </div>
    </div>
  );
}

/* ------------------------------ PriceBreakdown ----------------------------- */

export function PriceBreakdown({ breakdown, className }: { breakdown: PB; className?: string }) {
  const rows: [string, number][] = [
    ['Tickets', breakdown.subtotal],
    ['Convenience fee (5%)', breakdown.fees],
    ['GST on fee (18%)', breakdown.tax],
  ];
  return (
    <dl className={cn('space-y-2 text-sm', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between text-muted">
          <dt>{k}</dt>
          <dd className="font-mono tabular-nums text-text/90">{rupees(v, { decimals: true })}</dd>
        </div>
      ))}
      <div className="perforation !my-3" />
      <div className="flex items-baseline justify-between">
        <dt className="font-semibold">Total</dt>
        <dd className="font-display text-2xl font-bold">{rupees(breakdown.total, { decimals: true })}</dd>
      </div>
    </dl>
  );
}

/* ---------------------------- MockPaymentSheet ----------------------------- */

export function MockPaymentSheet({
  open,
  order,
  onPay,
  onFail,
  onClose,
}: {
  open: boolean;
  order: CheckoutOrderDTO | null;
  onPay: () => Promise<void>;
  onFail: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<'pay' | 'fail' | null>(null);
  const run = async (kind: 'pay' | 'fail') => {
    setBusy(kind);
    try {
      await (kind === 'pay' ? onPay() : onFail());
    } finally {
      setBusy(null);
    }
  };
  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="RushPay · Test mode">
      {order && (
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-signature p-5 text-white shadow-glow">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
            <div className="flex items-center justify-between">
              <CreditCard className="h-7 w-7" />
              <span className="font-mono text-xs opacity-80">TEST CARD</span>
            </div>
            <div className="mt-8 font-mono text-lg tracking-[0.2em]">4111 1111 1111 1111</div>
            <div className="mt-4 flex justify-between font-mono text-xs opacity-90">
              <span>RUSHPASS DEMO</span>
              <span>12/30</span>
            </div>
          </div>
          <div className="mt-5 flex items-baseline justify-between">
            <span className="text-sm text-muted">Amount</span>
            <span className="font-display text-3xl font-bold">{rupees(order.amount, { decimals: true })}</span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted">Order {order.orderId}</p>
          <div className="mt-6 grid gap-2">
            <Button variant="gradient" size="lg" loading={busy === 'pay'} disabled={!!busy} onClick={() => run('pay')} icon={<Lock className="h-4 w-4" />}>
              Pay {rupees(order.amount, { decimals: true })}
            </Button>
            <Button variant="danger" loading={busy === 'fail'} disabled={!!busy} onClick={() => run('fail')}>
              Simulate a failed payment
            </Button>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-success" /> No real money moves in test mode.
          </p>
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------- Razorpay -------------------------------- */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

export function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}
