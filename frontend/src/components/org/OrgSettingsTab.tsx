'use client';

import { StateCityPicker } from '../PlacePicker';
import { FestivalBadge } from '../FestivalBanner';
import { useFestivalTypes } from '@/lib/catalog';
import { cx } from '@/lib/cx';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useOrg } from '@/lib/org-context';
import { Alert, Button, Card, Field, Input, LabeledInput, SkeletonList, Textarea } from '../ui';
import { Save } from 'lucide-react';
import { OrgBrandingCard } from './OrgBrandingCard';

export function OrgSettingsTab() {
  const org = useOrg();
  if (!org.org) return org.loading ? <SkeletonList rows={2} /> : <Alert>Could not load mandal details.</Alert>;
  return (
    <div className="flex flex-col gap-4">
      <OrgBrandingCard />
      <Form key={org.org.id} />
    </div>
  );
}

function Form() {
  const org = useOrg();
  const { refresh, me } = useAuth();
  // Allowed festival types are set by the platform at registration; only the super admin edits them.
  const canEditFestivals = !!me?.isSuperAdmin;
  const [name, setName] = useState(org.org?.name ?? '');
  const [place, setPlace] = useState({ state: org.org?.state ?? '', city: org.org?.city ?? '' });
  const [address, setAddress] = useState(org.org?.address ?? '');
  const [festivals, setFestivals] = useState<string[]>(org.org?.festivalTypes ?? []);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setOk(false);
    if (!name.trim()) return setError('Enter the mandal name.');
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/organizations/${org.orgId}`, { name: name.trim(), state: place.state, city: place.city.trim(), address: address.trim() || undefined, ...(canEditFestivals ? { festivalTypes: festivals } : {}) });
      setOk(true);
      org.reload();
      void refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Mandal name" value={name} onChange={(e) => setName(e.target.value)} />
        <StateCityPicker state={place.state} city={place.city} onChange={setPlace} />
        <Field label="Address (printed on receipts)">
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        {canEditFestivals ? <FestivalChooser value={festivals} onChange={setFestivals} /> : <FestivalList value={festivals} />}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">Saved.</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save
        </Button>
      </form>
    </Card>
  );
}

/** Read-only for the mandal: the festival types the platform registered it for. */
function FestivalList({ value }: { value: string[] }) {
  const types = useFestivalTypes();
  const label = (k: string) => types.data?.find((t) => t.key === k)?.label ?? k.replace(/_/g, ' ').toLowerCase();
  return (
    <Field label="Registered festival types">
      <div className="flex flex-col gap-2 rounded-2xl border border-orange-200 bg-orange-50/40 p-3">
        {value.length ? (
          <div className="flex flex-wrap gap-2">
            {value.map((k) => (
              <span key={k} className="flex min-h-[40px] max-w-full items-center gap-1.5 rounded-full border border-orange-200 bg-white px-2.5 text-sm text-slate-800">
                <FestivalBadge type={k} className="h-6 w-6" />
                <span className="truncate">{label(k)}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-600">All festival types are open to your mandal.</p>
        )}
        <p className="text-xs text-slate-500">Set by the Parvsetu team when your mandal was approved. To run another type, contact them — or create the festival with “My event isn’t listed”.</p>
      </div>
    </Field>
  );
}

/** Super admin: pick the festivals/events this mandal may run; only these show when creating an event. */
export function FestivalChooser({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const types = useFestivalTypes();
  const [q, setQ] = useState('');
  const list = types.data ?? [];
  const t = q.trim().toLowerCase();
  const shown = t ? list.filter((f) => f.label.toLowerCase().includes(t) || f.group.toLowerCase().includes(t)) : list;
  const groups = [...new Set(shown.map((f) => f.group))];
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <Field label={`Festivals & events we celebrate (${value.length ? `${value.length} selected` : 'none selected — all are shown'})`}>
      <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search festivals…" className="min-w-0 flex-1" aria-label="Search festivals" />
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="min-h-[44px] rounded-xl px-3 text-sm font-semibold text-orange-700 hover:bg-orange-100">
              Clear all
            </button>
          )}
        </div>
        {types.error && <Alert kind="warning">Could not load festivals: {types.error}</Alert>}
        <div className="flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
          {groups.map((g) => {
            const inGroup = shown.filter((f) => f.group === g);
            const allOn = inGroup.every((f) => value.includes(f.key));
            return (
              <div key={g}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{g}</span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-orange-700 hover:underline"
                    onClick={() => onChange(allOn ? value.filter((k) => !inGroup.some((f) => f.key === k)) : [...new Set([...value, ...inGroup.map((f) => f.key)])])}
                  >
                    {allOn ? 'Unselect group' : 'Select group'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inGroup.map((f) => {
                    const on = value.includes(f.key);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(f.key)}
                        className={cx('flex min-h-[40px] items-center gap-1.5 rounded-full border px-2.5 text-sm', on ? 'border-orange-500 bg-white font-semibold text-orange-900 ring-2 ring-orange-400' : 'border-orange-200 bg-white text-slate-700')}
                      >
                        <FestivalBadge type={f.key} className="h-6 w-6" />
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-slate-500">Only the selected ones appear in the festival list when you create an event. Leave empty to see all.</p>
      </div>
    </Field>
  );
}
