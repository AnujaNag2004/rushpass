import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarDays, IndianRupee, Ticket, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { RevenueChart } from '../../components/Charts';
import { Button } from '../../components/ui/Button';
import { Badge, Card, Skeleton, StatCard } from '../../components/ui';
import { api } from '../../lib/api';
import { compactRupees, formatDateTime, rupees } from '../../lib/format';

interface AdminStats {
  users: number;
  events: number;
  bookings: number;
  revenue: number;
  salesByDay: { day: string; revenue: number; bookings: number }[];
  usersByRole: { role: string; count: number }[];
  recentBookings: { id: string; user: string; event: string; seats: number; total: number; createdAt: string }[];
}

export default function AdminDashboard() {
  const { data } = useQuery({ queryKey: ['admin-stats'], queryFn: () => api.get<AdminStats>('/admin/stats'), refetchInterval: 30_000 });
  return (
    <div className="container-page py-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Admin</h1>
          <p className="mt-1 text-muted">Platform health and activity.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/users">
            <Button variant="outline" icon={<Users className="h-4 w-4" />}>Users</Button>
          </Link>
          <Link to="/admin/rush-monitor">
            <Button variant="gradient" icon={<Activity className="h-4 w-4" />}>Rush monitor</Button>
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {data ? (
          <>
            <StatCard label="Revenue" value={compactRupees(data.revenue)} sub={rupees(data.revenue)} icon={<IndianRupee className="h-4 w-4" />} />
            <StatCard label="Bookings" value={data.bookings.toLocaleString('en-IN')} icon={<Ticket className="h-4 w-4" />} tone="accent" />
            <StatCard label="Users" value={data.users} icon={<Users className="h-4 w-4" />} tone="gold" />
            <StatCard label="Events" value={data.events} icon={<CalendarDays className="h-4 w-4" />} tone="success" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 p-5 lg:col-span-2">
          <h2 className="font-semibold">Platform revenue · 14 days</h2>
          {data ? <RevenueChart data={data.salesByDay} /> : <Skeleton className="mt-4 h-60" />}
        </Card>
        <Card className="min-w-0 p-5">
          <h2 className="font-semibold">Users by role</h2>
          <ul className="mt-4 space-y-3">
            {data?.usersByRole.map((r) => (
              <li key={r.role}>
                <div className="flex justify-between text-sm">
                  <span>{r.role}</span>
                  <span className="font-mono text-muted">{r.count}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-signature" style={{ width: `${(r.count / data.users) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="font-semibold">Recent bookings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-border bg-surface-2/50 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Event</th>
                <th className="px-5 py-3 font-medium">Seats</th>
                <th className="px-5 py-3 font-medium">Total</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data?.recentBookings.map((b) => (
                <tr key={b.id} className="hover:bg-surface-2/30">
                  <td className="px-5 py-3 font-medium">{b.user}</td>
                  <td className="max-w-[260px] truncate px-5 py-3 text-muted">{b.event}</td>
                  <td className="px-5 py-3">
                    <Badge tone="primary">{b.seats}</Badge>
                  </td>
                  <td className="px-5 py-3 font-mono">{rupees(b.total)}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDateTime(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
