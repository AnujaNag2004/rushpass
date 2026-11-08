import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { EventDTO } from '@rushpass/shared';
import { CATEGORIES, CITIES } from '@rushpass/shared';
import { EventCard } from '../components/Booking';
import { Button } from '../components/ui/Button';
import { EmptyState, Input, Select, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { CATEGORY_EMOJI, CATEGORY_LABEL, cn } from '../lib/format';

const PAGE_SIZE = 12;

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) set({ q });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const page = Number(params.get('page') ?? 1);
  const apiParams = new URLSearchParams(params);
  for (const k of ['minPrice', 'maxPrice']) {
    const v = apiParams.get(k);
    if (v) apiParams.set(k, String(Number(v) * 100)); // UI uses rupees, API uses paise
  }
  for (const k of ['from', 'to']) {
    const v = apiParams.get(k);
    if (v) apiParams.set(k, new Date(v + (k === 'to' ? 'T23:59:59' : 'T00:00:00')).toISOString());
  }
  apiParams.set('pageSize', String(PAGE_SIZE));

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['events', apiParams.toString()],
    queryFn: () => api.list<EventDTO>(`/events?${apiParams}`),
    placeholderData: keepPreviousData,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1;
  const activeFilters = ['category', 'city', 'from', 'to', 'minPrice', 'maxPrice', 'drops'].filter((k) => params.get(k));

  return (
    <div className="container-page py-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold md:text-4xl">Explore events</h1>
          <p className="mt-1 text-muted">{data ? `${data.meta.total} shows match` : 'Finding shows…'}</p>
        </div>
        <div className="flex gap-2">
          <label className="relative flex-1 md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
          </label>
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} icon={<SlidersHorizontal className="h-4 w-4" />}>
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button className={cn('chip', !params.get('category') && 'chip-active')} onClick={() => set({ category: null })}>
          All
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} className={cn('chip', params.get('category') === c && 'chip-active')} onClick={() => set({ category: params.get('category') === c ? null : c })}>
            {CATEGORY_EMOJI[c]} {CATEGORY_LABEL[c]}
          </button>
        ))}
        <button className={cn('chip', params.get('drops') === 'true' && 'chip-active')} onClick={() => set({ drops: params.get('drops') === 'true' ? null : 'true' })}>
          ⚡ Drops only
        </button>
      </div>

      {showFilters && (
        <div className="card mt-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
          <Select label="City" value={params.get('city') ?? ''} onChange={(e) => set({ city: e.target.value })}>
            <option value="">All cities</option>
            {CITIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <Input label="From" type="date" value={params.get('from') ?? ''} onChange={(e) => set({ from: e.target.value })} />
          <Input label="To" type="date" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value })} />
          <Input label="Min price (₹)" type="number" min={0} value={params.get('minPrice') ?? ''} onChange={(e) => set({ minPrice: e.target.value })} />
          <Input label="Max price (₹)" type="number" min={0} value={params.get('maxPrice') ?? ''} onChange={(e) => set({ maxPrice: e.target.value })} />
          <Select label="Sort by" value={params.get('sort') ?? 'date'} onChange={(e) => set({ sort: e.target.value })}>
            <option value="date">Soonest</option>
            <option value="popular">Selling fast</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="newest">Newest</option>
          </Select>
          {activeFilters.length > 0 && (
            <button
              className="flex items-center gap-1 text-sm text-muted hover:text-text sm:col-span-2 lg:col-span-6"
              onClick={() => setParams(new URLSearchParams(q ? { q } : {}), { replace: true })}
            >
              <X className="h-4 w-4" /> Clear all filters
            </button>
          )}
        </div>
      )}

      <div className={cn('mt-8 grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', isFetching && !isLoading && 'opacity-60')}>
        {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[380px]" />)}
        {data?.data.map((e, i) => <EventCard key={e.id} event={e} index={i} />)}
      </div>

      {data && !data.data.length && (
        <EmptyState
          art="search"
          title="No shows match those filters"
          body="Try a different city, widen the dates or clear the filters."
          action={
            <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </Button>
          }
        />
      )}

      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} icon={<ChevronLeft className="h-4 w-4" />}>
            Prev
          </Button>
          <span className="px-3 font-mono text-sm text-muted">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => set({ page: String(page + 1) })}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}
