import { motion } from 'framer-motion';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SeatDTO, SeatState, Tier } from '@rushpass/shared';
import { seatLabel } from '@rushpass/shared';
import { cn } from '../lib/format';

const CELL = 30;
const SEAT = 24;
const PAD_X = 44;
const PAD_TOP = 86;
const PAD_BOTTOM = 24;

export const TIER_COLOR: Record<Tier, string> = {
  REGULAR: 'rgb(var(--success))',
  PREMIUM: 'rgb(var(--accent))',
  VIP: 'rgb(var(--gold))',
};

export interface SeatMapProps {
  seats: SeatDTO[];
  states: Record<string, SeatState>;
  myUserId?: string;
  groupCode?: string;
  /** userId → colour for members of the current group. */
  memberColors?: Record<string, string>;
  /** userId → hovered seat, shown as a coloured ring (live cursors). */
  cursors?: Record<string, string | null>;
  cursorNames?: Record<string, string>;
  pending?: Set<string>;
  prices?: Record<Tier, number>;
  readOnly?: boolean;
  onSeatClick?: (seat: SeatDTO, state: SeatState | undefined) => void;
  onSeatHover?: (seatId: string | null) => void;
  className?: string;
}

type Visual = 'available' | 'mine' | 'member' | 'held' | 'booked';

function visualOf(state: SeatState | undefined, myUserId?: string, groupCode?: string, memberColors?: Record<string, string>): { v: Visual; color?: string } {
  if (!state) return { v: 'available' };
  if (state.status === 'BOOKED') return { v: 'booked' };
  if (state.userId && state.userId === myUserId) return { v: 'mine', color: memberColors?.[state.userId] };
  if (groupCode && state.groupCode === groupCode && state.userId && memberColors?.[state.userId]) {
    return { v: 'member', color: memberColors[state.userId] };
  }
  return { v: 'held' };
}

const SeatShape = memo(function SeatShape({
  seat,
  visual,
  color,
  pending,
  interactive,
  label,
  onClick,
  onHover,
  onKey,
  registerRef,
}: {
  seat: SeatDTO;
  visual: Visual;
  color?: string;
  pending: boolean;
  interactive: boolean;
  label: string;
  onClick: () => void;
  onHover: (on: boolean) => void;
  onKey: (e: KeyboardEvent<SVGGElement>) => void;
  registerRef: (el: SVGGElement | null) => void;
}) {
  const x = PAD_X + seat.x * CELL + (CELL - SEAT) / 2;
  const y = PAD_TOP + seat.y * CELL + (CELL - SEAT) / 2;
  const tierColor = TIER_COLOR[seat.tier];
  const selected = visual === 'mine' || visual === 'member';
  const fill =
    visual === 'mine'
      ? color ?? 'rgb(var(--primary))'
      : visual === 'member'
        ? color
        : visual === 'booked'
          ? 'rgb(var(--border))'
          : visual === 'held'
            ? 'url(#seat-stripes)'
            : 'rgb(var(--surface-2))';
  const stroke = visual === 'available' ? tierColor : visual === 'held' ? 'rgb(var(--muted) / 0.5)' : 'transparent';

  return (
    <motion.g
      ref={registerRef}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : -1}
      aria-label={label}
      aria-pressed={interactive ? visual === 'mine' : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={onKey}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      style={{ transformOrigin: `${x + SEAT / 2}px ${y + SEAT / 2}px`, transformBox: 'view-box' }}
      animate={selected ? { scale: [1, 1.28, 1] } : { scale: 1 }}
      transition={{ duration: 0.32 }}
      className={cn('outline-none', interactive ? 'cursor-pointer [&:hover>rect]:brightness-125 [&:focus-visible>rect]:stroke-text' : 'cursor-not-allowed')}
    >
      <title>{label}</title>
      <rect
        x={x}
        y={y}
        width={SEAT}
        height={SEAT - 3}
        rx={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.6}
        opacity={visual === 'booked' ? 0.7 : pending ? 0.55 : 1}
        className="transition-[fill,opacity] duration-200"
      />
      <rect x={x + 3} y={y + SEAT - 2} width={SEAT - 6} height={3} rx={1.5} fill={visual === 'available' ? tierColor : fill} opacity={0.65} />
      {selected && (
        <text x={x + SEAT / 2} y={y + SEAT / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0B0A14" fontFamily="JetBrains Mono">
          {seat.number}
        </text>
      )}
    </motion.g>
  );
});

export function SeatMap({
  seats,
  states,
  myUserId,
  groupCode,
  memberColors,
  cursors,
  cursorNames,
  pending,
  prices,
  readOnly,
  onSeatClick,
  onSeatHover,
  className,
}: SeatMapProps) {
  const [scale, setScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seatRefs = useRef(new Map<string, SVGGElement>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);

  const { width, height, rowLabels, sectionLabels } = useMemo(() => {
    const maxX = Math.max(0, ...seats.map((s) => s.x));
    const maxY = Math.max(0, ...seats.map((s) => s.y));
    const rows = new Map<string, { y: number; label: string; minX: number; maxX: number }>();
    const sections = new Map<string, number>();
    for (const s of seats) {
      const k = `${s.section}|${s.row}`;
      const r = rows.get(k);
      if (!r) rows.set(k, { y: s.y, label: s.row, minX: s.x, maxX: s.x });
      else {
        r.minX = Math.min(r.minX, s.x);
        r.maxX = Math.max(r.maxX, s.x);
      }
      sections.set(s.section, Math.min(sections.get(s.section) ?? Infinity, s.y));
    }
    return {
      width: PAD_X * 2 + (maxX + 1) * CELL,
      height: PAD_TOP + (maxY + 1) * CELL + PAD_BOTTOM,
      rowLabels: [...rows.values()],
      sectionLabels: [...sections.entries()],
    };
  }, [seats]);

  /**
   * Scale that fits the map to its container. On a phone a full-width fit shrinks seats below a
   * comfortable tap size, so interactive maps keep finger-sized seats there and scroll instead.
   */
  const fitScale = useCallback(
    (containerWidth: number) => {
      const min = !readOnly && containerWidth < 640 ? 0.85 : 0.45;
      return Number(Math.min(1.25, Math.max(min, (containerWidth - 8) / width)).toFixed(2));
    },
    [readOnly, width],
  );

  const fit = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !width) return;
    setScale(fitScale(el.clientWidth));
    // Start centred on the stage when the map is wider than the screen.
    requestAnimationFrame(() => el.scrollTo({ left: (el.scrollWidth - el.clientWidth) / 2, top: 0 }));
  }, [fitScale, width]);

  // Fit to the container width on first render.
  useEffect(fit, [fit]);

  const zoom = useCallback((delta: number) => setScale((s) => Math.min(2.5, Math.max(0.4, Number((s + delta).toFixed(2))))), []);

  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom(e.deltaY > 0 ? -0.1 : 0.1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      pinch.current = { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), scale };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    const [a, b] = [e.touches[0], e.touches[1]];
    const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setScale(Math.min(2.5, Math.max(0.4, pinch.current.scale * (dist / pinch.current.dist))));
  };

  /** Arrow keys move focus to the nearest seat in that direction. */
  const onKey = (seat: SeatDTO, e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSeatClick?.(seat, states[seat.id]);
      return;
    }
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    let best: SeatDTO | null = null;
    let bestScore = Infinity;
    for (const s of seats) {
      const dx = s.x - seat.x;
      const dy = s.y - seat.y;
      if (d[0] && Math.sign(dx) !== d[0]) continue;
      if (d[1] && Math.sign(dy) !== d[1]) continue;
      if (d[0] && dy !== 0) continue;
      const score = d[0] ? Math.abs(dx) : Math.abs(dy) * 100 + Math.abs(dx);
      if (score > 0 && score < bestScore) {
        best = s;
        bestScore = score;
      }
    }
    if (best) seatRefs.current.get(best.id)?.focus();
  };

  const cursorEntries = Object.entries(cursors ?? {}).filter(([uid, sid]) => sid && uid !== myUserId);
  const seatById = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);

  return (
    <div className={cn('relative', className)}>
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1 rounded-xl border border-border bg-surface/80 p-1 backdrop-blur">
        <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" onClick={() => zoom(0.15)} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text" onClick={() => zoom(-0.15)} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text"
          onClick={fit}
          aria-label="Fit to screen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[70vh] overflow-auto overscroll-contain rounded-card"
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => (pinch.current = null)}
      >
        <svg
          width={width * scale}
          height={height * scale}
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto block select-none"
          role="group"
          aria-label="Seat map. Use arrow keys to move between seats and Enter to select."
        >
          <defs>
            <pattern id="seat-stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgb(var(--surface-2))" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(var(--muted) / 0.45)" strokeWidth="3" />
            </pattern>
            <linearGradient id="stage-grad" x1="0" x2="1">
              <stop offset="0" stopColor="#7C5CFF" />
              <stop offset=".55" stopColor="#FF4D8D" />
              <stop offset="1" stopColor="#FFB547" />
            </linearGradient>
            <radialGradient id="stage-glow" cx=".5" cy="0" r=".8">
              <stop offset="0" stopColor="#FF4D8D" stopOpacity=".35" />
              <stop offset="1" stopColor="#FF4D8D" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Stage */}
          <rect x={PAD_X} y={0} width={width - PAD_X * 2} height={PAD_TOP - 10} fill="url(#stage-glow)" />
          <path d={`M ${PAD_X + 20} 22 Q ${width / 2} 52 ${width - PAD_X - 20} 22`} stroke="url(#stage-grad)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <text x={width / 2} y={20} textAnchor="middle" fontSize="11" letterSpacing="5" fill="rgb(var(--muted))" fontFamily="Space Grotesk" fontWeight="600">
            STAGE
          </text>

          {sectionLabels.map(([name, y]) => (
            <text key={name} x={width / 2} y={PAD_TOP + y * CELL - 6} textAnchor="middle" fontSize="10" letterSpacing="2" fill="rgb(var(--muted) / 0.8)" fontFamily="Space Grotesk" fontWeight="600">
              {name.toUpperCase()}
            </text>
          ))}
          {rowLabels.map((r) => (
            <g key={`${r.label}-${r.y}`} fontSize="10" fill="rgb(var(--muted))" fontFamily="JetBrains Mono" fontWeight="600">
              <text x={PAD_X + r.minX * CELL - 10} y={PAD_TOP + r.y * CELL + CELL / 2 + 3} textAnchor="end">
                {r.label}
              </text>
              <text x={PAD_X + (r.maxX + 1) * CELL + 10} y={PAD_TOP + r.y * CELL + CELL / 2 + 3} textAnchor="start">
                {r.label}
              </text>
            </g>
          ))}

          {seats.map((seat) => {
            const state = states[seat.id];
            const { v, color } = visualOf(state, myUserId, groupCode, memberColors);
            const interactive = !readOnly && (v === 'available' || v === 'mine');
            const price = prices ? ` · ₹${(prices[seat.tier] / 100).toLocaleString('en-IN')}` : '';
            const status = v === 'available' ? 'available' : v === 'mine' ? 'selected by you' : v === 'member' ? 'picked by your group' : v === 'held' ? 'on hold' : 'booked';
            return (
              <SeatShape
                key={seat.id}
                seat={seat}
                visual={v}
                color={color}
                pending={!!pending?.has(seat.id)}
                interactive={interactive}
                label={`${seat.section} row ${seat.row} seat ${seat.number} (${seatLabel(seat)}), ${seat.tier}${price}, ${status}`}
                onClick={() => onSeatClick?.(seat, state)}
                onHover={(on) => onSeatHover?.(on ? seat.id : null)}
                onKey={(e) => onKey(seat, e)}
                registerRef={(el) => {
                  if (el) seatRefs.current.set(seat.id, el);
                  else seatRefs.current.delete(seat.id);
                }}
              />
            );
          })}

          {cursorEntries.map(([uid, sid]) => {
            const s = seatById.get(sid!);
            if (!s) return null;
            const cx = PAD_X + s.x * CELL + CELL / 2;
            const cy = PAD_TOP + s.y * CELL + CELL / 2;
            const c = memberColors?.[uid] ?? '#fff';
            return (
              <motion.g key={uid} initial={false} animate={{ x: 0 }} pointerEvents="none">
                <motion.circle cx={cx} cy={cy} r={16} fill="none" stroke={c} strokeWidth={2} initial={{ r: 10, opacity: 0 }} animate={{ r: 16, opacity: 1 }} />
                <rect x={cx + 10} y={cy - 26} rx={5} height={16} width={(cursorNames?.[uid]?.split(' ')[0].length ?? 4) * 6.5 + 10} fill={c} />
                <text x={cx + 15} y={cy - 15} fontSize="10" fontWeight="700" fill="#0B0A14" fontFamily="Inter">
                  {cursorNames?.[uid]?.split(' ')[0] ?? ''}
                </text>
              </motion.g>
            );
          })}
        </svg>
      </div>
      {!readOnly && <p className="mt-2 text-center text-[11px] text-muted sm:hidden">Drag to move around · pinch to zoom</p>}
    </div>
  );
}

export function SeatLegend({ group, className }: { group?: boolean; className?: string }) {
  const items: { label: string; node: JSX.Element }[] = [
    { label: 'Regular', node: <span className="h-4 w-4 rounded-[5px] border-[1.6px] border-success bg-surface-2" /> },
    { label: 'Premium', node: <span className="h-4 w-4 rounded-[5px] border-[1.6px] border-accent bg-surface-2" /> },
    { label: 'VIP', node: <span className="h-4 w-4 rounded-[5px] border-[1.6px] border-gold bg-surface-2" /> },
    { label: 'Your pick', node: <span className="h-4 w-4 rounded-[5px] bg-primary" /> },
    ...(group ? [{ label: 'Friends', node: <span className="h-4 w-4 rounded-[5px] bg-[conic-gradient(#FF4D8D,#FFB547,#2EE6A6,#38BDF8,#FF4D8D)]" /> }] : []),
    { label: 'On hold', node: <span className="seat-striped h-4 w-4 rounded-[5px] border border-muted/40" /> },
    { label: 'Booked', node: <span className="h-4 w-4 rounded-[5px] bg-border" /> },
  ];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted', className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.node}
          {i.label}
        </span>
      ))}
    </div>
  );
}
