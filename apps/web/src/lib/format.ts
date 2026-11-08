import { clsx, type ClassValue } from 'clsx';

export const cn = (...v: ClassValue[]) => clsx(v);

/** Amounts are stored in paise. */
export function rupees(paise: number | undefined | null, opts: { decimals?: boolean } = {}) {
  const value = (paise ?? 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function compactRupees(paise: number) {
  const value = paise / 100;
  if (value >= 1e7) return `₹${(value / 1e7).toFixed(1)}Cr`;
  if (value >= 1e5) return `₹${(value / 1e5).toFixed(1)}L`;
  if (value >= 1e3) return `₹${(value / 1e3).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

export function formatDate(iso: string | Date, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...opts });
}

export function formatTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string | Date) {
  return `${formatDate(iso)} · ${formatTime(iso)}`;
}

export function dayParts(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString('en-IN', { day: '2-digit' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
  };
}

export function mmss(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function duration(sec: number) {
  if (sec < 60) return `${Math.max(1, Math.round(sec))}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export const CATEGORY_LABEL: Record<string, string> = {
  CONCERT: 'Concerts',
  MOVIE: 'Movies',
  COMEDY: 'Comedy',
  SPORTS: 'Sports',
  THEATRE: 'Theatre',
  FESTIVAL: 'Festivals',
};

export const CATEGORY_EMOJI: Record<string, string> = {
  CONCERT: '🎤',
  MOVIE: '🎬',
  COMEDY: '😂',
  SPORTS: '🏟️',
  THEATRE: '🎭',
  FESTIVAL: '🎪',
};
