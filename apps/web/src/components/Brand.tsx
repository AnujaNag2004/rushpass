import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/format';
import { useTheme } from '../store/theme';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C5CFF" />
          <stop offset=".55" stopColor="#FF4D8D" />
          <stop offset="1" stopColor="#FFB547" />
        </linearGradient>
      </defs>
      <path d="M10 14a6 6 0 0 1 6-6h32a6 6 0 0 1 6 6v10a8 8 0 0 0 0 16v10a6 6 0 0 1-6 6H16a6 6 0 0 1-6-6V40a8 8 0 0 0 0-16z" fill="url(#lg-mark)" />
      <path d="M36 14 24 34h9l-3 16 12-21h-9z" fill="#0B0A14" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2', className)} aria-label="RushPass home">
      <LogoMark className="h-8 w-8 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
      <span className="font-display text-xl font-bold tracking-tight">
        Rush<span className="text-gradient">Pass</span>
      </span>
    </Link>
  );
}

/** Slowly drifting violet/pink blobs used behind heroes and the waiting room. */
export function GradientMesh({ className, intense }: { className?: string; intense?: boolean }) {
  return (
    <div className={cn('pointer-events-none absolute inset-0 -z-10 overflow-hidden', className)} aria-hidden>
      <div className={cn('absolute -left-[10%] -top-[20%] h-[60vmax] w-[60vmax] animate-drift rounded-full bg-primary blur-[110px]', intense ? 'opacity-40' : 'opacity-25')} />
      <div className={cn('absolute -right-[15%] top-[10%] h-[50vmax] w-[50vmax] animate-drift-slow rounded-full bg-accent blur-[120px]', intense ? 'opacity-30' : 'opacity-[0.18]')} />
      <div className="absolute bottom-[-30%] left-[30%] h-[40vmax] w-[40vmax] animate-drift rounded-full bg-gold opacity-10 blur-[120px]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27160%27 height=%27160%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27/%3E%3C/svg%3E")',
        }}
      />
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-btn border border-border bg-surface-2/60 text-muted transition hover:text-text"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <motion.span key={theme} initial={{ y: 16, opacity: 0, rotate: -40 }} animate={{ y: 0, opacity: 1, rotate: 0 }}>
        {theme === 'dark' ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </motion.span>
    </button>
  );
}

export function Avatar({ name, color, size = 36, className }: { name: string; color: string; size?: number; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-full font-display font-bold text-[#0B0A14] ring-2 ring-bg', className)}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
      title={name}
    >
      {letters}
    </span>
  );
}

export function PresenceDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)} aria-label={online ? 'online' : 'offline'}>
      {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full ring-2 ring-surface', online ? 'bg-success' : 'bg-muted/50')} />
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 34 }: { people: { name: string; color: string; online?: boolean }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <motion.div key={p.name + i} className="relative -ml-2 first:ml-0" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.05 }}>
          <Avatar name={p.name} color={p.color} size={size} />
          {p.online !== undefined && <PresenceDot online={p.online} className="absolute -bottom-0.5 -right-0.5" />}
        </motion.div>
      ))}
      {people.length > max && (
        <span className="-ml-2 grid place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted ring-2 ring-bg" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </div>
  );
}
