import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { Role, UserDTO } from '@rushpass/shared';
import { ROLES } from '@rushpass/shared';
import { Avatar } from '../../components/Brand';
import { Button } from '../../components/ui/Button';
import { Card, Skeleton } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAuth } from '../../store/auth';

type Row = UserDTO & { createdAt: string; bookings: number };

export default function AdminUsersPage() {
  const me = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const key = ['admin-users', debounced, page];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => api.list<Row>(`/admin/users?page=${page}&pageSize=15${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  const pages = data ? Math.max(1, Math.ceil(data.meta.total / data.meta.pageSize)) : 1;

  const changeRole = async (id: string, role: Role) => {
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      toast.success(`Role changed to ${role}`);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="container-page py-10">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Admin
      </Link>
      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <h1 className="text-3xl font-bold">Users</h1>
        <label className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
      </div>
      <Card className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2/50 text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 font-medium">Bookings</th>
                <th className="px-5 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="p-5">
                    <Skeleton className="h-40" />
                  </td>
                </tr>
              )}
              {data?.data.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2/30">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} color={u.avatarColor} size={34} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{u.name}</div>
                        <div className="truncate text-xs text-muted">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDate(u.createdAt, { year: 'numeric' })}</td>
                  <td className="px-5 py-3 font-mono">{u.bookings}</td>
                  <td className="px-5 py-3">
                    <select
                      className="input !w-36 !py-1.5"
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => changeRole(u.id, e.target.value as Role)}
                      aria-label={`Role for ${u.name}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-sm text-muted">
          <span>{data?.meta.total ?? 0} users</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-mono">
              {page}/{pages}
            </span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
