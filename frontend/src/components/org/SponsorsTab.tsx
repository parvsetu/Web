'use client';

import { useRef, useState } from 'react';
import { Handshake, ImagePlus, Pencil, Plus, Save, Ticket, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { logoToDataUrl } from '@/lib/logo';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import { SponsorStrip, sponsorLogoSrc, type SponsorPublic } from '../SponsorStrip';
import { Alert, Badge, Button, Card, Checkbox, Empty, LabeledInput, LabeledSelect, Modal, SkeletonList } from '../ui';
import { useOrgEvents } from './shared';

interface Sponsor extends SponsorPublic {
  eventId: string | null;
  isActive: boolean;
  sortOrder: number;
  showOnPasses: boolean;
  passesPrinted: number;
  printFees: string;
}

const TIERS: { key: Sponsor['tier']; label: string }[] = [
  { key: 'TITLE', label: 'Title partner (biggest banner)' },
  { key: 'PLATINUM', label: 'Platinum' },
  { key: 'GOLD', label: 'Gold' },
  { key: 'SILVER', label: 'Silver' },
  { key: 'PARTNER', label: 'Partner' },
];

export function SponsorsTab() {
  const org = useOrg();
  const list = useAsync(() => api.get<Sponsor[]>(`/organizations/${org.orgId}/sponsors`), [org.orgId]);
  const events = useOrgEvents(org.orgId);
  const [editing, setEditing] = useState<Sponsor | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canEdit = can(org.perms, 'SETTINGS_UPDATE');
  const evName = (id: string | null) => (id ? events.data?.find((e) => e.id === id)?.name ?? 'One festival' : 'All festivals');

  async function remove(s: Sponsor) {
    if (!window.confirm(`Remove ${s.name} as a partner?`)) return;
    setError(null);
    try {
      await api.del(`/organizations/${org.orgId}/sponsors/${s.id}`);
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        Partners&apos; banners and logos appear on your public festival page, the pass-booking page and the volunteer app. Title and
        Platinum partners get the large banner. Printing your own sponsors on visitors&apos; passes is <strong>free</strong> — no credit is used.
      </Alert>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden className="h-4 w-4" /> Add partner
          </Button>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : (list.data ?? []).length === 0 ? (
        <Empty icon={Handshake} title="No partners yet">
          Add a collaboration partner (for example a jeweller or a local business) to show their banner to every visitor.
        </Empty>
      ) : (
        <>
          {(list.data ?? []).map((s) => (
            <Card key={s.id} className="flex items-center gap-3">
              {sponsorLogoSrc(s) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sponsorLogoSrc(s)!} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain ring-1 ring-orange-100" />
              ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50 font-black text-orange-700">{s.name.slice(0, 2).toUpperCase()}</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{s.name}</span>
                  <Badge className="bg-amber-100 text-amber-900">{s.tier}</Badge>
                  {!s.isActive && <Badge value="INACTIVE" />}
                </div>
                <div className="truncate text-sm text-slate-600">{s.bannerText ?? s.tagline ?? '—'}</div>
                <div className="text-xs text-slate-500">{evName(s.eventId)}</div>
                {s.showOnPasses && (
                  <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-semibold text-fuchsia-800">
                    <Ticket aria-hidden className="h-3.5 w-3.5" /> Printed on {s.passesPrinted.toLocaleString('en-IN')} passes
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing(s)}>
                    <Pencil aria-hidden className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label="Remove" className="text-red-700" onClick={() => remove(s)}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
          <Card className="bg-orange-50/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Preview (as visitors see it)</p>
            <SponsorStrip sponsors={(list.data ?? []).filter((s) => s.isActive)} />
          </Card>
        </>
      )}
      {editing && (
        <SponsorModal
          sponsor={editing === 'new' ? null : editing}
          events={events.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function SponsorModal({ sponsor, events, onClose, onSaved }: { sponsor: Sponsor | null; events: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const org = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: sponsor?.name ?? '',
    tier: sponsor?.tier ?? 'PARTNER',
    tagline: sponsor?.tagline ?? '',
    bannerText: sponsor?.bannerText ?? '',
    websiteUrl: sponsor?.websiteUrl ?? '',
    eventId: sponsor?.eventId ?? '',
    isActive: sponsor?.isActive ?? true,
    showOnPasses: sponsor?.showOnPasses ?? false,
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const preview = logo ?? (removeLogo || !sponsor ? null : sponsorLogoSrc(sponsor));

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      setLogo(await logoToDataUrl(f));
      setRemoveLogo(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('Enter the partner name.');
    if (form.websiteUrl && !/^https?:\/\//i.test(form.websiteUrl)) return setError('Website must start with https://');
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(), tier: form.tier, tagline: form.tagline, bannerText: form.bannerText, websiteUrl: form.websiteUrl,
        eventId: form.eventId || null, isActive: form.isActive, showOnPasses: form.showOnPasses,
        ...(logo ? { logoDataUrl: logo } : {}),
        ...(removeLogo && sponsor ? { removeLogo: true } : {}),
      };
      if (sponsor) await api.patch(`/organizations/${org.orgId}/sponsors/${sponsor.id}`, body);
      else await api.post(`/organizations/${org.orgId}/sponsors`, body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={sponsor ? 'Edit partner' : 'Add partner'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo preview" className="h-20 w-20 rounded-2xl bg-white object-contain ring-1 ring-orange-200" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-50 text-orange-400 ring-1 ring-orange-200">
              <ImagePlus aria-hidden className="h-8 w-8" />
            </span>
          )}
          <div className="flex flex-col gap-1">
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus aria-hidden className="h-4 w-4" /> {preview ? 'Change logo' : 'Upload logo'}
            </Button>
            {preview && (
              <Button variant="ghost" size="sm" className="text-red-700" onClick={() => { setLogo(null); setRemoveLogo(true); }}>
                Remove logo
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
        </div>
        <LabeledInput label="Partner name" value={form.name} onChange={set('name')} placeholder="e.g. Tanishq" />
        <LabeledSelect label="Partnership level" value={form.tier} onChange={set('tier')}>
          {TIERS.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </LabeledSelect>
        <LabeledInput label="Banner / ad line" value={form.bannerText} onChange={set('bannerText')} maxLength={300} placeholder="e.g. Festive offers at Tanishq Salt Lake — 20% off making charges" />
        <LabeledInput label="Tagline (optional)" value={form.tagline} onChange={set('tagline')} maxLength={160} placeholder="e.g. Official jewellery partner" />
        <LabeledInput label="Website (optional)" type="url" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" />
        <LabeledSelect label="Show on" value={form.eventId} onChange={set('eventId')}>
          <option value="">All festivals of this mandal</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </LabeledSelect>
        <Checkbox label="Active (shown to visitors)" checked={form.isActive} onChange={(v) => setForm((x) => ({ ...x, isActive: v }))} />
        <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 p-3">
          <Checkbox
            label={<span className="font-semibold">Print logo &amp; tagline on every pass (free)</span>}
            checked={form.showOnPasses}
            onChange={(v) => setForm((x) => ({ ...x, showOnPasses: v }))}
          />
          <p className="mt-1 text-xs text-slate-600">
            Showing your own sponsors on passes costs you nothing — no pass credit is used. Up to 3 sponsors are printed per pass.
          </p>
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save
        </Button>
      </form>
    </Modal>
  );
}
