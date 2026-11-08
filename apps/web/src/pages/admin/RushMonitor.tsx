import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Activity, ArrowLeft, Lock, ShieldCheck, ShieldX, Ticket, Users, Wifi, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { RushMonitorDTO } from '@rushpass/shared';
import { GradientMesh } from '../../components/Brand';
import { Card, StatCard } from '../../components/ui';
import { api } from '../../lib/api';
import { cn } from '../../lib/format';

interface Point {
  t: string;
  locks: number;
  conflicts: number;
  bookings: number;
}

export default function RushMonitorPage() {
  const { data } = useQuery({
    queryKey: ['rush-monitor'],
    queryFn: () => api.get<RushMonitorDTO>('/admin/rush-monitor'),
    refetchInterval: 1000,
  });
  const prev = useRef<RushMonitorDTO | null>(null);
  const [series, setSeries] = useState<Point[]>([]);
  const [rates, setRates] = useState({ locks: 0, conflicts: 0, bookings: 0 });

  useEffect(() => {
    if (!data) return;
    const p = prev.current;
    if (p && data.at > p.at) {
      const dt = (data.at - p.at) / 1000;
      const r = {
        locks: Math.max(0, (data.locksOk - p.locksOk) / dt),
        conflicts: Math.max(0, (data.lockConflicts - p.lockConflicts) / dt),
        bookings: Math.max(0, (data.bookingsConfirmed - p.bookingsConfirmed) / dt),
      };
      setRates(r);
      setSeries((s) => [...s.slice(-59), { t: new Date(data.at).toLocaleTimeString('en-IN', { minute: '2-digit', second: '2-digit' }), ...r }]);
    }
    prev.current = data;
  }, [data]);

  const safe = (data?.doubleBookings ?? 0) === 0;

  return (
    <div className="container-page py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold md:text-4xl">
            <Activity className="h-8 w-8 text-accent" /> Live rush monitor
          </h1>
          <p className="mt-1 text-muted">Run the k6 load test and watch the platform hold the line. Updates every second.</p>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-sm text-success">
          <span className="relative flex h-2 w-2">
            <span className="absolute h-full w-full animate-ping rounded-full bg-success opacity-70" />
            <span className="relative h-2 w-2 rounded-full bg-success" />
          </span>
          Live
        </span>
      </div>

      <motion.div
        layout
        className={cn('relative isolate mt-8 overflow-hidden rounded-[28px] border p-8 text-center', safe ? 'border-success/40' : 'border-danger/60')}
      >
        <GradientMesh className={safe ? 'opacity-40' : 'opacity-60 hue-rotate-[140deg]'} />
        <div className="flex items-center justify-center gap-3 text-sm font-medium uppercase tracking-[0.3em] text-muted">
          {safe ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldX className="h-5 w-5 text-danger" />} Double bookings
        </div>
        <div className={cn('mt-2 font-display text-[clamp(5rem,16vw,9rem)] font-bold leading-none', safe ? 'text-success' : 'text-danger')}>
          {data?.doubleBookings ?? '—'}
        </div>
        <p className="mt-2 text-sm text-muted">Checked live against Postgres with a GROUP BY on (show, seat).</p>
      </motion.div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Live sockets" value={data?.activeSockets ?? 0} icon={<Wifi className="h-4 w-4" />} />
        <StatCard label="In queue" value={data?.queueLength ?? 0} icon={<Users className="h-4 w-4" />} tone="gold" sub={`${data?.admittedTotal ?? 0} admitted`} />
        <StatCard label="Seats locked" value={data?.seatsLocked ?? 0} icon={<Lock className="h-4 w-4" />} tone="accent" />
        <StatCard label="Locks / sec" value={rates.locks.toFixed(1)} icon={<Activity className="h-4 w-4" />} tone="primary" sub={`${data?.locksOk ?? 0} total`} />
        <StatCard label="Rejected / sec" value={rates.conflicts.toFixed(1)} icon={<XCircle className="h-4 w-4" />} tone="danger" sub={`${data?.lockConflicts ?? 0} conflicts`} />
        <StatCard label="Bookings / sec" value={rates.bookings.toFixed(1)} icon={<Ticket className="h-4 w-4" />} tone="success" sub={`${data?.bookingsConfirmed ?? 0} total`} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Last 60 seconds</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={series} margin={{ left: 0, right: 8, top: 16 }}>
            <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="t" stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} minTickGap={30} />
            <YAxis stroke="rgb(var(--muted))" fontSize={11} tickLine={false} axisLine={false} width={40} />
            <Tooltip contentStyle={{ background: 'rgb(var(--surface))', border: '1px solid rgb(var(--border))', borderRadius: 12, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="locks" name="Seat locks/s" stroke="#7C5CFF" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="conflicts" name="Rejected/s" stroke="#FF4D8D" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="bookings" name="Bookings/s" stroke="#2EE6A6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Run the rush</h2>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-surface-2 p-4 font-mono text-xs text-muted">
          {`k6 run -e API_URL=http://localhost:4000 -e SHOW_ID=<show id> load-tests/booking-rush.js`}
        </pre>
      </Card>
    </div>
  );
}
