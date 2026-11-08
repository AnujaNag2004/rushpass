import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { forwardRef, useEffect, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/format';

/* ---------------------------------- Card ---------------------------------- */

export function Card({ className, hover, ...rest }: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return <div className={cn('card', hover && 'card-hover', className)} {...rest} />;
}

/* ---------------------------------- Badge --------------------------------- */

type Tone = 'primary' | 'accent' | 'gold' | 'success' | 'danger' | 'muted';
const tones: Record<Tone, string> = {
  primary: 'bg-primary/15 text-primary border-primary/30',
  accent: 'bg-accent/15 text-accent border-accent/30',
  gold: 'bg-gold/15 text-gold border-gold/30',
  success: 'bg-success/15 text-success border-success/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  muted: 'bg-surface-2 text-muted border-border',
};

export function Badge({ tone = 'primary', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- Field --------------------------------- */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const inputId = id ?? rest.name;
    return (
      <div className={className}>
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          className={cn('input', error && 'border-danger focus:border-danger focus:ring-danger/25')}
          {...rest}
        />
        {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }>(
  ({ label, error, className, id, children, ...rest }, ref) => {
    const selectId = id ?? rest.name;
    return (
      <div className={className}>
        {label && (
          <label htmlFor={selectId} className="label">
            {label}
          </label>
        )}
        <select ref={ref} id={selectId} className={cn('input appearance-none pr-8', error && 'border-danger')} {...rest}>
          {children}
        </select>
        {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

/* --------------------------------- Skeleton -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-surface-2', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

/* --------------------------------- Spinner --------------------------------- */

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary', className)} role="status" aria-label="Loading" />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-9 w-9" />
    </div>
  );
}

/* --------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn('card relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none p-6 sm:rounded-card', className)}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              {title && <h2 className="text-lg font-semibold">{title}</h2>}
              <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------------------------- Tabs ---------------------------------- */

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-btn border border-border bg-surface-2/60 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'relative rounded-[9px] px-4 py-1.5 text-sm font-medium transition',
            value === t.value ? 'text-text' : 'text-muted hover:text-text',
          )}
        >
          {value === t.value && (
            <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-[9px] bg-surface shadow-sm" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />
          )}
          <span className="relative">
            {t.label}
            {t.count !== undefined && <span className="ml-1.5 text-xs text-muted">{t.count}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- EmptyState ------------------------------- */

export function EmptyState({ title, body, action, art = 'ticket' }: { title: string; body?: string; action?: ReactNode; art?: 'ticket' | 'search' | 'stage' }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <EmptyArt kind={art} />
      <h3 className="mt-6 text-xl font-semibold">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function EmptyArt({ kind }: { kind: 'ticket' | 'search' | 'stage' }) {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none" aria-hidden>
      <defs>
        <linearGradient id="ea" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset=".55" stopColor="#FF4D8D" />
          <stop offset="1" stopColor="#FFB547" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="108" rx="54" ry="6" fill="rgb(var(--border))" />
      {kind === 'ticket' && (
        <g transform="rotate(-8 80 60)">
          <path d="M28 30h104v18a10 10 0 0 0 0 20v18H28V68a10 10 0 0 0 0-20z" fill="url(#ea)" opacity=".9" />
          <path d="M60 32v52" stroke="#0B0A14" strokeDasharray="4 4" strokeWidth="2" opacity=".5" />
          <circle cx="98" cy="58" r="10" fill="#0B0A14" opacity=".35" />
        </g>
      )}
      {kind === 'search' && (
        <g>
          <circle cx="72" cy="52" r="30" stroke="url(#ea)" strokeWidth="8" />
          <path d="m94 74 22 22" stroke="url(#ea)" strokeWidth="10" strokeLinecap="round" />
        </g>
      )}
      {kind === 'stage' && (
        <g>
          <path d="M20 90 L80 20 L140 90 Z" fill="url(#ea)" opacity=".25" />
          <rect x="30" y="80" width="100" height="14" rx="4" fill="url(#ea)" />
          <circle cx="80" cy="48" r="8" fill="url(#ea)" />
        </g>
      )}
    </svg>
  );
}

/* --------------------------------- StatCard -------------------------------- */

export function StatCard({
  label,
  value,
  icon,
  tone = 'primary',
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  sub?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        {icon && <span className={cn('rounded-lg border p-2', tones[tone])}>{icon}</span>}
      </div>
      <div className="mt-3 font-display text-3xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}
