import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactRupees, rupees } from '../lib/format';

const axis = { stroke: 'rgb(var(--muted))', fontSize: 11, tickLine: false, axisLine: false } as const;

function ChartTooltip({ active, payload, label, money }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <div className="mb-1 text-muted">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="font-mono font-semibold">
          {money ? rupees(p.value) : p.value.toLocaleString('en-IN')}
        </div>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: { data: { day: string; revenue: number; bookings: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7C5CFF" stopOpacity={0.55} />
            <stop offset="1" stopColor="#FF4D8D" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="rev-stroke" x1="0" x2="1">
            <stop offset="0" stopColor="#7C5CFF" />
            <stop offset=".55" stopColor="#FF4D8D" />
            <stop offset="1" stopColor="#FFB547" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={20} />
        <YAxis {...axis} width={52} tickFormatter={(v) => compactRupees(v)} />
        <Tooltip content={<ChartTooltip money />} cursor={{ stroke: 'rgb(var(--primary))', strokeDasharray: 4 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="url(#rev-stroke)" strokeWidth={3} fill="url(#rev-fill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const TIER_FILL: Record<string, string> = { REGULAR: '#2EE6A6', PREMIUM: '#FF4D8D', VIP: '#FFB547' };

export function TierChart({ data }: { data: { tier: string; sold: number; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
        <CartesianGrid stroke="rgb(var(--border))" strokeDasharray="3 6" vertical={false} />
        <XAxis dataKey="tier" {...axis} />
        <YAxis {...axis} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgb(var(--surface-2))' }} />
        <Bar dataKey="sold" name="Tickets" radius={[8, 8, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.tier} fill={TIER_FILL[d.tier]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
