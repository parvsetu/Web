'use client';

import { useState } from 'react';
import { BadgeIndianRupee, BriefcaseBusiness, Layers, Save, Sparkles, Tags } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { FestivalBadge } from '../FestivalBanner';
import { Alert, Badge, Button, Card, Checkbox, Empty, Input, LabeledInput, SectionTitle, SkeletonList } from '../ui';

interface FeeRates {
  defaultFee: string;
  groups: { group: string; fee: string | null }[];
  types: { key: string; label: string; group: string; custom: boolean; fee: string | null }[];
}
interface PlatformSettings { defaultEventFee: string; agentReferralFee: string; agentCommissionPercent: string }
interface CustomType { key: string; label: string; group: string; description: string | null; status: string; inCatalog: boolean; organization: { id: string; name: string } | null; createdAt: string }

/**
 * Super admin: per-event registration fee (default, per catalog category,
 * per festival type — a mandal override lives in Billing → Manage), agent
 * referral defaults, and the custom ("not listed") festival types.
 */
export function EventFeesAdmin() {
  const rates = useAsync(() => api.get<FeeRates>('/platform/event-fee-rates'), []);
  const customs = useAsync(() => api.get<CustomType[]>('/platform/custom-festival-types'), []);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function setRate(scope: 'TYPE' | 'GROUP', key: string, fee: string | null) {
    setMsg(null);
    try {
      rates.setData(await api.put<FeeRates>('/platform/event-fee-rates', { scope, key, fee }));
      setMsg({ kind: 'success', text: fee === null ? 'Rate removed — falls back to the next level.' : 'Fee saved. Applies to festivals submitted from now on.' });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  }

  const t = filter.trim().toLowerCase();
  const [showAll, setShowAll] = useState(false);
  const matching = (rates.data?.types ?? []).filter((x) => !t || x.label.toLowerCase().includes(t) || x.group.toLowerCase().includes(t));
  // Long catalog: by default only types with their own fee (plus a few), search or "show all" for the rest.
  const types = t || showAll ? matching : [...matching.filter((x) => x.fee !== null), ...matching.filter((x) => x.fee === null).slice(0, 6)];

  return (
    <div className="flex flex-col gap-4">
      <DefaultsCard onSaved={rates.reload} />
      <p className="rounded-xl bg-violet-50 px-3 py-2 text-sm text-violet-900">
        Which fee applies: <strong>mandal override</strong> (Billing → Manage) › <strong>festival type</strong> › <strong>category</strong> › <strong>default</strong>. It is quoted when a festival is submitted and locked when you approve it.
      </p>
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <SectionTitle icon={Layers}>Fee by category</SectionTitle>
      {!rates.data ? <SkeletonList rows={2} /> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rates.data.groups.map((g) => <RateRow key={g.group} label={g.group} fee={g.fee} placeholder={`default ${fmtMoney(rates.data!.defaultFee)}`} onSave={(v) => setRate('GROUP', g.group, v)} />)}
        </div>
      )}

      <SectionTitle icon={Tags}>Fee by festival type</SectionTitle>
      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search festival or category…" aria-label="Search festival types" />
      {!rates.data ? <SkeletonList rows={3} /> : types.length === 0 ? <Empty title="No festival types match" /> : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {types.map((x) => {
            const g = rates.data!.groups.find((y) => y.group === x.group)?.fee;
            return (
              <RateRow key={x.key} badge={x.key} label={x.label} sub={x.group + (x.custom ? ' · custom' : '')} fee={x.fee}
                placeholder={g ? `category ${fmtMoney(g)}` : `default ${fmtMoney(rates.data!.defaultFee)}`} onSave={(v) => setRate('TYPE', x.key, v)} />
            );
          })}
        </div>
      )}
      {!t && !showAll && matching.length > types.length && (
        <Button variant="secondary" onClick={() => setShowAll(true)}>Show all {matching.length} festival types</Button>
      )}

      <SectionTitle icon={Sparkles}>Custom (“not listed”) festival types</SectionTitle>
      {customs.error && <Alert>{customs.error}</Alert>}
      {!customs.data ? <SkeletonList rows={2} /> : customs.data.length === 0 ? <Empty title="No custom types yet" /> : (
        <div className="flex flex-col gap-2">
          {customs.data.map((c) => (
            <Card key={c.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-semibold">{c.label}</span>
                  <Badge value={c.status === 'APPROVED' ? 'APPROVED' : c.status === 'REJECTED' ? 'REJECTED' : 'PENDING'}>{c.status.toLowerCase()}</Badge>
                  {c.inCatalog && <Badge className="bg-violet-100 text-violet-800">in catalog</Badge>}
                </div>
                <p className="text-xs text-slate-500">{c.group}{c.organization ? ` · proposed by ${c.organization.name}` : ''} · <span className="font-mono">{c.key}</span></p>
                {c.description && <p className="text-xs italic text-slate-600">“{c.description}”</p>}
              </div>
              {c.status === 'APPROVED' && (
                <div className="shrink-0">
                  <Checkbox label="Show in catalog" checked={c.inCatalog} onChange={async (v) => {
                    try {
                      await api.patch(`/platform/custom-festival-types/${c.key}`, { inCatalog: v });
                      customs.reload();
                      rates.reload();
                    } catch (e) {
                      setMsg({ kind: 'error', text: errorMessage(e) });
                    }
                  }} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RateRow({ label, sub, badge, fee, placeholder, onSave }: { label: string; sub?: string; badge?: string; fee: string | null; placeholder: string; onSave: (v: string | null) => Promise<void> }) {
  const [v, setV] = useState(fee ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = (fee ?? '') !== v;
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-2.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-2">
        {badge && <FestivalBadge type={badge} className="h-9 w-9 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-tight">{label}</p>
          {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
        </div>
        {fee !== null && <Badge className="shrink-0 bg-orange-100 text-orange-800">{fmtMoney(fee)}</Badge>}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input aria-label={`Fee for ${label}`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.]/g, ''))} placeholder={placeholder} className="!min-h-[40px] min-w-0 flex-1 text-sm" />
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={busy} aria-label={`Save fee for ${label}`}
          onClick={async () => { setBusy(true); await onSave(v.trim() === '' ? null : v.trim()); setBusy(false); }}>
          <Save aria-hidden className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DefaultsCard({ onSaved }: { onSaved: () => void }) {
  const q = useAsync(() => api.get<PlatformSettings>('/platform/billing/settings'), []);
  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const f = form ?? q.data;
  if (!f) return q.loading ? <SkeletonList rows={1} /> : null;
  const set = (k: keyof PlatformSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') });
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={BadgeIndianRupee}>Defaults</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LabeledInput label="Default fee per event (₹)" inputMode="decimal" value={f.defaultEventFee} onChange={set('defaultEventFee')} hint="Each festival pays separately" />
        <LabeledInput label="Agent referral per mandal (₹)" inputMode="decimal" value={f.agentReferralFee} onChange={set('agentReferralFee')} hint="Earned on the mandal’s first paid fee" />
        <LabeledInput label="Agent share of each fee (%)" inputMode="decimal" value={f.agentCommissionPercent} onChange={set('agentCommissionPercent')} hint="0 = referral only" />
      </div>
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">Saved.</Alert>}
      <div>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          setOk(false);
          try {
            const s = await api.put<PlatformSettings>('/platform/billing/settings', { defaultEventFee: f.defaultEventFee, agentReferralFee: f.agentReferralFee, agentCommissionPercent: f.agentCommissionPercent });
            setForm(s);
            setOk(true);
            onSaved();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>
          <BriefcaseBusiness aria-hidden className="h-4 w-4" /> Save defaults
        </Button>
      </div>
    </Card>
  );
}
