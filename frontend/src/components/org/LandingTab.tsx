'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, CreditCard, ExternalLink, Eye, Globe, Plus, Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import { fetchAll } from '@/lib/paged';
import { fmtDate, fmtMoney } from '@/lib/format';
import { apiImageSrc } from '@/lib/media';
import { LANDING_THEMES, type LandingContent, type LandingPurchase, type LandingStatus } from '@/lib/landing';
import type { Photo } from '@/lib/gallery-types';
import type { EventDetail, Paged } from '@/lib/types';
import { cx } from '@/lib/cx';
import { Alert, Badge, Button, Card, Checkbox, Field, LabeledInput, Modal, SectionTitle, SkeletonList, Textarea } from '../ui';

const STATE_LABEL: Record<LandingStatus['state'], { text: string; tone: string }> = {
  NOT_ACTIVE: { text: 'Not active', tone: 'DRAFT' },
  ACTIVE: { text: 'Active', tone: 'ACTIVE' },
  EXPIRED: { text: 'Expired', tone: 'EXPIRED' },
  DISABLED: { text: 'Paid · switched off', tone: 'PAUSED' },
};

/** Mandal admin: buy/renew the yearly landing page and edit what it shows. */
export function LandingTab() {
  const org = useOrg();
  const q = useAsync(() => api.get<LandingStatus>(`/organizations/${org.orgId}/landing-page`), [org.orgId]);
  const [paying, setPaying] = useState(false);
  if (q.error) return <Alert>{q.error}</Alert>;
  if (!q.data) return <SkeletonList rows={3} />;
  const s = q.data;
  const edit = can(org.perms, 'SETTINGS_UPDATE');
  const label = STATE_LABEL[s.state];
  const live = s.state === 'ACTIVE';
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your page on Parvsetu</p>
            <p className="break-all text-lg font-extrabold text-slate-900">{s.publicPath}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <Badge value={label.tone}>{label.text}</Badge>
              {s.paidUntil && <span>{new Date(s.paidUntil) > new Date() ? 'Paid until' : 'Expired on'} {fmtDate(s.paidUntil.slice(0, 10))}</span>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-orange-700">{fmtMoney(s.price)}</p>
            <p className="text-xs text-slate-500">per year</p>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          A shareable page for your mandal with your banner and logo, upcoming festivals (with booking links), past festivals by year, public photos, sponsors and
          contact buttons. Renewing while active adds a year to the current end date.
        </p>
        <div className="flex flex-wrap gap-2">
          {edit && (
            s.demoPayments ? (
              <Button onClick={() => setPaying(true)}>
                <CreditCard aria-hidden className="h-4 w-4" /> {s.paidUntil && new Date(s.paidUntil) > new Date() ? 'Renew for 1 year' : 'Buy for 1 year'}
              </Button>
            ) : (
              <Alert kind="info">Online payment isn&apos;t available yet — ask the platform admin to activate your page.</Alert>
            )
          )}
          {live ? (
            <Link href={s.publicPath} target="_blank" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 font-semibold hover:bg-orange-50">
              <ExternalLink aria-hidden className="h-4 w-4" /> Open page
            </Link>
          ) : (
            <Link href={`${s.publicPath}?preview=1`} target="_blank" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 font-semibold hover:bg-orange-50">
              <Eye aria-hidden className="h-4 w-4" /> Preview
            </Link>
          )}
        </div>
        {s.purchases.length > 0 && <PurchaseList list={s.purchases} />}
      </Card>
      <Editor key={JSON.stringify(s.content)} content={s.content} editable={edit} onSaved={q.reload} />
      {paying && <PayModal price={s.price} onClose={() => setPaying(false)} onDone={() => { setPaying(false); q.reload(); }} />}
    </div>
  );
}

function PurchaseList({ list }: { list: LandingPurchase[] }) {
  return (
    <ul className="divide-y divide-orange-50 rounded-xl border border-orange-100 text-sm">
      {list.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <span>{fmtDate(p.createdAt.slice(0, 10))} · {fmtMoney(p.amount)}</span>
          <span className="flex items-center gap-2">
            {p.paidUntil && <span className="text-xs text-slate-500">until {fmtDate(p.paidUntil.slice(0, 10))}</span>}
            <Badge value={p.status === 'PAID' ? 'SUCCESS' : p.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PayModal({ price, onClose, onDone }: { price: string; onClose: () => void; onDone: () => void }) {
  const org = useOrg();
  const [pending, setPending] = useState<LandingPurchase | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setBusy(true);
    setError(null);
    try {
      setPending(await api.post<LandingPurchase>(`/organizations/${org.orgId}/landing-page/purchases`));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function pay(outcome: 'success' | 'fail') {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<LandingPurchase>(`/organizations/${org.orgId}/landing-page/purchases/${pending.id}/demo-pay`, { outcome });
      if (r.status === 'PAID') onDone();
      else {
        setPending(null);
        setError('Payment failed. Nothing was charged — you can try again.');
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Landing page — 1 year">
      <div className="flex flex-col gap-4">
        <p className="text-center text-3xl font-black">{fmtMoney(pending?.amount ?? price)}</p>
        {!pending ? (
          <Button size="lg" loading={busy} onClick={() => void start()}>
            <CreditCard aria-hidden className="h-5 w-5" /> Continue to payment
          </Button>
        ) : (
          <>
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo payment — no real money is charged.</div>
            <Button variant="success" size="lg" loading={busy} onClick={() => void pay('success')}>
              Pay {fmtMoney(pending.amount)} (demo)
            </Button>
            <Button variant="ghost" onClick={() => void pay('fail')} disabled={busy}>Simulate failed payment</Button>
          </>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

function Editor({ content, editable, onSaved }: { content: LandingContent; editable: boolean; onSaved: () => void }) {
  const org = useOrg();
  const [f, setF] = useState({
    enabled: content.enabled,
    headline: content.headline ?? '',
    about: content.about ?? '',
    highlights: content.highlights.length ? content.highlights : [''],
    contactPhone: content.contactPhone ?? '',
    contactEmail: content.contactEmail ?? '',
    instagramUrl: content.instagramUrl ?? '',
    facebookUrl: content.facebookUrl ?? '',
    youtubeUrl: content.youtubeUrl ?? '',
    whatsappNumber: content.whatsappNumber ? `+${content.whatsappNumber}` : '',
    featuredEventIds: content.featuredEventIds,
    photoIds: content.photoIds,
    themeColor: content.themeColor,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setOk(false);
    setF((x) => ({ ...x, [k]: v }));
  };

  const events = useAsync(() => fetchAll<EventDetail>(`/organizations/${org.orgId}/events`), [org.orgId]);
  const photos = useAsync(
    () => (can(org.perms, 'GALLERY_VIEW') ? api.get<Paged<Photo>>(`/organizations/${org.orgId}/photos`, { public: true, pageSize: 60 }).then((r) => r.items) : Promise.resolve([] as Photo[])),
    [org.orgId],
  );
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (events.data ?? []).filter((e) => e.status === 'ACTIVE' && e.endDate >= today);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api.put(`/organizations/${org.orgId}/landing-page`, { ...f, highlights: f.highlights.map((h) => h.trim()).filter(Boolean) });
      setOk(true);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const toggleIn = (k: 'featuredEventIds' | 'photoIds', id: string) => set(k, f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id]);

  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <SectionTitle icon={Globe}>Page content</SectionTitle>
        <fieldset disabled={!editable} className="flex flex-col gap-4">
          <Checkbox label="Show the page to visitors (while it is paid)" checked={f.enabled} onChange={(v) => set('enabled', v)} />
          <LabeledInput label="Headline" maxLength={120} value={f.headline} onChange={(e) => set('headline', e.target.value)} placeholder="e.g. Pune’s people’s festival committee since 1972" />
          <Field label="About the mandal" hint="Plain text — line breaks are kept.">
            <Textarea maxLength={4000} rows={6} value={f.about} onChange={(e) => set('about', e.target.value)} />
          </Field>
          <Field label={`Highlights (${f.highlights.filter((h) => h.trim()).length}/6)`} hint="Short bullet points, e.g. “Free bhandara every evening”.">
            <div className="flex flex-col gap-2">
              {f.highlights.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className="min-h-[44px] w-full rounded-xl border border-orange-200 px-3"
                    maxLength={80}
                    value={h}
                    aria-label={`Highlight ${i + 1}`}
                    onChange={(e) => set('highlights', f.highlights.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <Button variant="ghost" size="sm" aria-label="Remove highlight" onClick={() => set('highlights', f.highlights.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {f.highlights.length < 6 && (
                <Button variant="secondary" size="sm" className="w-fit" onClick={() => set('highlights', [...f.highlights, ''])}>
                  <Plus aria-hidden className="h-4 w-4" /> Add highlight
                </Button>
              )}
            </div>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Contact phone" type="tel" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            <LabeledInput label="Contact email" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            <LabeledInput label="Instagram link" placeholder="https://instagram.com/yourmandal" value={f.instagramUrl} onChange={(e) => set('instagramUrl', e.target.value)} />
            <LabeledInput label="Facebook link" placeholder="https://facebook.com/yourmandal" value={f.facebookUrl} onChange={(e) => set('facebookUrl', e.target.value)} />
            <LabeledInput label="YouTube link" placeholder="https://youtube.com/@yourmandal" value={f.youtubeUrl} onChange={(e) => set('youtubeUrl', e.target.value)} />
            <LabeledInput label="WhatsApp number" type="tel" placeholder="+91 98765 43210" value={f.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value)} />
          </div>
          <Field label="Theme colour">
            <div className="flex flex-wrap gap-2">
              {Object.entries(LANDING_THEMES).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={f.themeColor === key}
                  onClick={() => set('themeColor', key)}
                  className={cx('flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm font-semibold', f.themeColor === key ? 'border-slate-900 ring-2 ring-slate-900' : 'border-orange-200')}
                >
                  <span className="h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.via}, ${t.to})` }} />
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Festivals to feature" hint={f.featuredEventIds.length ? `${f.featuredEventIds.length} chosen` : 'None chosen — every active/upcoming public festival is shown.'}>
            <div className="flex flex-col gap-1 rounded-xl border border-orange-100 p-2">
              {upcoming.length === 0 && <p className="text-sm text-slate-500">No active or upcoming festivals.</p>}
              {upcoming.map((e) => (
                <Checkbox key={e.id} label={`${e.name} · ${fmtDate(e.startDate)}`} checked={f.featuredEventIds.includes(e.id)} onChange={() => toggleIn('featuredEventIds', e.id)} />
              ))}
            </div>
          </Field>
          <Field label="Photos to show" hint={f.photoIds.length ? `${f.photoIds.length} chosen (in this order)` : 'None chosen — your 12 latest public photos are shown. Make photos public in a festival’s Photos tab.'}>
            {(photos.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No public photos yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {(photos.data ?? []).map((p) => {
                  const on = f.photoIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" aria-pressed={on} onClick={() => toggleIn('photoIds', p.id)} className={cx('relative aspect-square overflow-hidden rounded-xl ring-2', on ? 'ring-orange-500' : 'ring-transparent')}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={apiImageSrc(p.publicThumbUrl)!} alt={p.caption ?? ''} className={cx('h-full w-full object-cover', !on && 'opacity-70')} />
                      {on && <CheckCircle2 aria-hidden className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white text-orange-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </fieldset>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">Saved. The public page refreshes within a few minutes.</Alert>}
        {editable && (
          <Button type="submit" loading={busy}>
            <Save aria-hidden className="h-4 w-4" /> Save page
          </Button>
        )}
      </form>
    </Card>
  );
}
