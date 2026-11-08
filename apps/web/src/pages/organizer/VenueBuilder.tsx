import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { LayoutRow, SeatDTO, Tier, VenueDTO, VenueLayout } from '@rushpass/shared';
import { TIERS, generateSeats, venueLayoutSchema } from '@rushpass/shared';
import { SeatLegend, SeatMap, TIER_COLOR } from '../../components/SeatMap';
import { Button } from '../../components/ui/Button';
import { Card, PageLoader } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';

const nextLabel = (label: string) => (/^[A-Y]$/.test(label) ? String.fromCharCode(label.charCodeAt(0) + 1) : `${label}1`.slice(0, 3));

export default function VenueBuilderPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const venue = useQuery({ queryKey: ['venue', id], queryFn: () => api.get<VenueDTO>(`/venues/${id}`) });
  const [layout, setLayout] = useState<VenueLayout | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (venue.data?.layoutJson && !layout) setLayout(venue.data.layoutJson);
  }, [venue.data, layout]);

  const preview = useMemo<SeatDTO[]>(
    () => (layout ? generateSeats(layout).map((s, i) => ({ ...s, id: `p${i}` })) : []),
    [layout],
  );

  if (venue.isLoading || !layout) return <PageLoader />;

  const update = (fn: (l: VenueLayout) => void) =>
    setLayout((prev) => {
      const copy = structuredClone(prev!);
      fn(copy);
      return copy;
    });

  const setRow = (si: number, ri: number, patch: Partial<LayoutRow>) => update((l) => Object.assign(l.sections[si].rows[ri], patch));

  const save = async () => {
    const parsed = venueLayoutSchema.safeParse(layout);
    if (!parsed.success) {
      toast.error('Check the layout: every section needs a name and at least one row');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/venues/${id}/layout`, parsed.data);
      toast.success(`Saved — ${preview.length} seats generated`);
      qc.invalidateQueries({ queryKey: ['venue', id] });
      qc.invalidateQueries({ queryKey: ['venues'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const tierCounts = TIERS.map((t) => ({ t, n: preview.filter((s) => s.tier === t).length }));

  return (
    <div className="container-page py-8">
      <Link to="/organizer" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Organizer studio
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Seat map builder</h1>
          <p className="text-muted">
            {venue.data?.name} · {venue.data?.city}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex gap-3 text-sm">
            {tierCounts.map(({ t, n }) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_COLOR[t] }} />
                {n} {t.toLowerCase()}
              </span>
            ))}
          </div>
          <Button variant="gradient" loading={saving} onClick={save} icon={<Save className="h-4 w-4" />}>
            Save {preview.length} seats
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[440px_1fr]">
        <div className="space-y-4">
          {layout.sections.map((section, si) => (
            <Card key={si} className="p-4">
              <div className="flex items-center gap-2">
                <input
                  className="input font-semibold"
                  value={section.name}
                  onChange={(e) => update((l) => (l.sections[si].name = e.target.value))}
                  aria-label="Section name"
                />
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2" disabled={si === 0} onClick={() => update((l) => l.sections.splice(si - 1, 0, l.sections.splice(si, 1)[0]))} aria-label="Move section up">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-surface-2" disabled={si === layout.sections.length - 1} onClick={() => update((l) => l.sections.splice(si + 1, 0, l.sections.splice(si, 1)[0]))} aria-label="Move section down">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger" disabled={layout.sections.length === 1} onClick={() => update((l) => l.sections.splice(si, 1))} aria-label="Delete section">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-[52px_64px_1fr_1fr_32px] gap-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                <span>Row</span>
                <span>Seats</span>
                <span>Tier</span>
                <span>Aisle after</span>
                <span />
              </div>
              <div className="mt-1 space-y-1.5">
                {section.rows.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-[52px_64px_1fr_1fr_32px] items-center gap-2">
                    <input className="input !px-2 !py-1.5 text-center font-mono" value={row.label} maxLength={3} onChange={(e) => setRow(si, ri, { label: e.target.value.toUpperCase() })} aria-label="Row label" />
                    <input className="input !px-2 !py-1.5 text-center" type="number" min={1} max={60} value={row.seats} onChange={(e) => setRow(si, ri, { seats: Math.max(1, Math.min(60, Number(e.target.value))) })} aria-label="Seats in row" />
                    <select className="input !px-2 !py-1.5" value={row.tier} onChange={(e) => setRow(si, ri, { tier: e.target.value as Tier })} aria-label="Tier" style={{ color: TIER_COLOR[row.tier] }}>
                      {TIERS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      className="input !px-2 !py-1.5"
                      placeholder="e.g. 5,10"
                      defaultValue={row.gapsAfter.join(',')}
                      onBlur={(e) =>
                        setRow(si, ri, {
                          gapsAfter: e.target.value
                            .split(',')
                            .map((x) => parseInt(x.trim(), 10))
                            .filter((n) => Number.isFinite(n) && n > 0),
                        })
                      }
                      aria-label="Aisle after seat numbers"
                    />
                    <button className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-danger/10 hover:text-danger" disabled={section.rows.length === 1} onClick={() => update((l) => l.sections[si].rows.splice(ri, 1))} aria-label="Delete row">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                icon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  update((l) => {
                    const rows = l.sections[si].rows;
                    const last = rows[rows.length - 1];
                    rows.push({ ...last, label: nextLabel(last.label), gapsAfter: [...last.gapsAfter] });
                  })
                }
              >
                Add row
              </Button>
            </Card>
          ))}
          <Button
            variant="outline"
            className="w-full"
            icon={<Plus className="h-4 w-4" />}
            disabled={layout.sections.length >= 8}
            onClick={() => update((l) => l.sections.push({ name: `Section ${l.sections.length + 1}`, rows: [{ label: 'A', seats: 12, tier: 'REGULAR', gapsAfter: [] }] }))}
          >
            Add section
          </Button>
        </div>

        <Card className="h-fit min-w-0 p-4 xl:sticky xl:top-24">
          <div className="mb-3 text-sm font-medium text-muted">Live preview</div>
          <SeatMap key={preview.length} seats={preview} states={{}} readOnly />
          <SeatLegend className="mt-4 border-t border-border pt-4" />
        </Card>
      </div>
    </div>
  );
}
