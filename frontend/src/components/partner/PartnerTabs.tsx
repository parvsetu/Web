'use client';

import { useRef, useState } from 'react';
import { Building2, CalendarDays, Check, History, ImagePlus, Megaphone, PauseCircle, Printer, Save, Send, Ticket, Wallet, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, humanize, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { logoToDataUrl } from '@/lib/logo';
import { usePagedList } from '@/lib/paged';
import type { Paged } from '@/lib/types';
import type { PartnerCampaign, PartnerMandal, PartnerOverview, PartnerRecharge, PartnerTx } from '@/lib/partner-types';
import { TX_LABEL } from '@/lib/partner-types';
import { StateCityPicker } from '../PlacePicker';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, LabeledSelect, Pager, SectionTitle, SkeletonList, Stat, Table, Td, Textarea, cx } from '../ui';
import { CampaignCard, CapBar, PartnerLogo, PartnerRechargeModal, PrintingBadge, WalletHero, partnerLogoSrc } from './PartnerParts';

const locked = (o: PartnerOverview) => o.partner.status === 'SUSPENDED' || o.partner.status === 'REJECTED';

// ─── Overview ─────────────────────────────────────────────────────────

export function OverviewTab({ o, onRecharge, onNew }: { o: PartnerOverview; onRecharge: () => void; onNew: () => void }) {
  const list = useAsync(() => api.get<Paged<PartnerCampaign>>('/partner/campaigns', { pageSize: 50 }), []);
  const live = (list.data?.items ?? []).filter((c) => c.status === 'APPROVED' || c.status === 'PAUSED' || c.status === 'REQUESTED');
  return (
    <div className="flex flex-col gap-4">
      <WalletHero balance={o.partner.walletBalance} wallet={o.wallet} onRecharge={onRecharge} locked={locked(o)} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active campaigns" value={o.stats.approved} tone="green" icon={Megaphone} />
        <Stat label="Awaiting approval" value={o.stats.requested} tone="amber" icon={PauseCircle} />
        <Stat label="Passes printed" value={o.stats.passesPrinted.toLocaleString('en-IN')} tone="purple" icon={Printer} />
        <Stat label="Total spent" value={fmtMoney(o.stats.spent)} tone="pink" icon={Wallet} />
      </div>
      <SectionTitle icon={Megaphone} action={!locked(o) && <Button size="sm" onClick={onNew}><Send aria-hidden className="h-4 w-4" /> New campaign</Button>}>
        Your campaigns
      </SectionTitle>
      {list.loading && !list.data ? (
        <SkeletonList rows={2} />
      ) : live.length === 0 ? (
        <Empty icon={Megaphone} title="No running campaigns">Pick a mandal and request your first campaign — your logo is printed on its passes once approved.</Empty>
      ) : (
        <Card>
          <Table head={['Mandal', 'Festival', 'Status', 'Printed', 'Rate', 'Spent']}>
            {live.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="font-semibold">{c.organization.name}</div>
                  <div className="text-xs text-slate-500">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</div>
                </Td>
                <Td className="text-xs">{c.event?.name ?? 'All festivals'}</Td>
                <Td><PrintingBadge c={c} /></Td>
                <Td><CapBar printed={c.passesPrinted} cap={c.maxPasses} /></Td>
                <Td className="tabular-nums">{fmtMoney(c.rate)}</Td>
                <Td className="font-semibold tabular-nums text-fuchsia-700">{fmtMoney(c.spent)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── New campaign ─────────────────────────────────────────────────────

export function NewCampaignTab({ o, onCreated }: { o: PartnerOverview; onCreated: () => void }) {
  const [place, setPlace] = useState({ state: '', city: '' });
  const mandals = usePagedList<PartnerMandal>('/partner/mandals', { state: place.state || undefined, city: place.city || undefined }, { pageSize: 8 });
  const [picked, setPicked] = useState<PartnerMandal | null>(null);
  const today = todayIn('Asia/Kolkata');
  const [form, setForm] = useState({ eventId: '', startDate: today, endDate: today, message: o.partner.tagline ?? '', maxPasses: '1000' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PartnerCampaign | null>(null);
  const [busy, setBusy] = useState(false);
  const ev = picked?.events.find((e) => e.id === form.eventId);
  const cap = Number(form.maxPasses) || 0;
  const estimate = picked && cap > 0 ? Number(picked.ratePerPass) * cap : null;

  function choose(m: PartnerMandal) {
    setPicked(m);
    setDone(null);
    const first = m.events[0];
    setForm((f) => ({ ...f, eventId: '', startDate: first && first.startDate > today ? first.startDate : today, endDate: m.events.reduce((mx, e) => (e.endDate > mx ? e.endDate : mx), today) }));
  }
  function pickEvent(id: string) {
    const e = picked?.events.find((x) => x.id === id);
    setForm((f) => ({ ...f, eventId: id, ...(e ? { startDate: e.startDate > today ? e.startDate : today, endDate: e.endDate } : {}) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!picked) return setError('Choose a mandal first.');
    if (form.message.trim().length < 3) return setError('Write a short promo line (3–120 characters).');
    if (form.endDate < form.startDate) return setError('The end date must be on or after the start date.');
    if (form.maxPasses && !(cap >= 1)) return setError('Max passes must be a whole number, or leave it empty for no cap.');
    setBusy(true);
    try {
      const c = await api.post<PartnerCampaign>('/partner/campaigns', {
        organizationId: picked.id, eventId: form.eventId || null, message: form.message.trim(), startDate: form.startDate, endDate: form.endDate,
        ...(form.maxPasses ? { maxPasses: cap } : {}),
      });
      setDone(c);
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
      <div className="flex flex-col gap-3">
        <SectionTitle icon={Building2}>1. Pick a mandal</SectionTitle>
        <SearchBar value={mandals.search} onChange={mandals.setSearch} placeholder="Search mandal, city or festival" total={mandals.total} />
        <StateCityPicker state={place.state} city={place.city} onChange={setPlace} />
        {mandals.error && <Alert>{mandals.error}</Alert>}
        {mandals.loading && !mandals.data ? (
          <SkeletonList rows={3} />
        ) : mandals.items.length === 0 ? (
          <Empty icon={Building2} title="No mandals with upcoming festivals match" />
        ) : (
          mandals.items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m)}
              aria-pressed={picked?.id === m.id}
              className={cx(
                'flex flex-col gap-2 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md',
                picked?.id === m.id ? 'border-fuchsia-400 ring-4 ring-fuchsia-500/20' : 'border-orange-100',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold">{m.name}</div>
                  <div className="text-xs text-slate-500">{[m.city, m.state].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <span className="shrink-0 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-xs font-bold text-white">{fmtMoney(m.ratePerPass)} / pass</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.events.map((e) => (
                  <span key={e.id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs text-orange-900 ring-1 ring-orange-100">
                    <CalendarDays aria-hidden className="h-3 w-3" /> {e.name} · {fmtDate(e.startDate)}
                  </span>
                ))}
              </div>
              {picked?.id === m.id && <span className="inline-flex items-center gap-1 text-xs font-bold text-fuchsia-700"><Check aria-hidden className="h-4 w-4" /> Selected</span>}
            </button>
          ))
        )}
        <Pager page={mandals.page} pageSize={mandals.pageSize} total={mandals.total} onPage={mandals.setPage} />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4 lg:sticky lg:top-20">
        <SectionTitle icon={Megaphone}>2. Campaign details</SectionTitle>
        <Card className="flex flex-col gap-4">
          {picked ? (
            <div className="rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 px-3 py-2 text-sm">
              <span className="font-bold text-violet-900">{picked.name}</span> · rate <span className="font-bold">{fmtMoney(picked.ratePerPass)}</span> per pass printed
            </div>
          ) : (
            <Alert kind="info">Choose a mandal on the left to see its festivals and rate.</Alert>
          )}
          <LabeledSelect label="Festival" value={form.eventId} onChange={(e) => pickEvent(e.target.value)} disabled={!picked}>
            <option value="">All festivals of this mandal</option>
            {picked?.events.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({fmtDate(e.startDate)} – {fmtDate(e.endDate)}){e.status === 'DRAFT' ? ' · upcoming' : ''}</option>
            ))}
          </LabeledSelect>
          {ev && <p className="-mt-2 text-xs text-slate-500">{humanize(ev.festivalType)} · {ev.city ?? picked?.city ?? ''}</p>}
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput label="From" type="date" min={today} value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
            <LabeledInput label="To" type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>
          <Field label="Promo line printed on each pass" hint={`${form.message.length}/120 · e.g. “Show this pass for 10% off making charges”`}>
            <Textarea value={form.message} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} className="min-h-[72px]" />
          </Field>
          <LabeledInput label="Max passes (cap)" inputMode="numeric" value={form.maxPasses} onChange={(e) => setForm((f) => ({ ...f, maxPasses: e.target.value.replace(/\D/g, '') }))} hint="Leave empty for no cap — printing still stops when your wallet runs out." />
          <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-white">
            <span className="text-sm font-semibold">Estimated maximum spend</span>
            <span className="text-2xl font-black tabular-nums">{estimate !== null ? fmtMoney(estimate) : picked ? 'No cap' : '—'}</span>
          </div>
          <p className="text-xs text-slate-500">
            You pay {picked ? fmtMoney(picked.ratePerPass) : 'the mandal’s rate'} per pass actually printed with your logo, from your wallet. The Parvsetu team reviews every request; the rate is locked when it is approved.
          </p>
          {error && <Alert>{error}</Alert>}
          {done && <Alert kind="success">Request sent to the platform team for {done.organization.name}. You can follow it under Campaigns.</Alert>}
          <Button type="submit" size="lg" loading={busy} disabled={!picked || locked(o)}>
            <Send aria-hidden className="h-5 w-5" /> Submit request
          </Button>
        </Card>
      </form>
    </div>
  );
}

// ─── Campaigns ────────────────────────────────────────────────────────

export function CampaignsTab({ o, onChanged }: { o: PartnerOverview; onChanged: () => void }) {
  const [status, setStatus] = useState('');
  const list = usePagedList<PartnerCampaign>('/partner/campaigns', { status: status || undefined }, { pageSize: 10 });
  const [error, setError] = useState<string | null>(null);

  async function cancel(c: PartnerCampaign) {
    if (!window.confirm(`Cancel your campaign at ${c.organization.name}? It stops printing immediately.`)) return;
    setError(null);
    try {
      await api.post(`/partner/campaigns/${c.id}/cancel`);
      list.reload();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sm:w-60">
        <LabeledSelect label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All campaigns</option>
          {['REQUESTED', 'APPROVED', 'PAUSED', 'ENDED', 'REJECTED', 'CANCELLED'].map((s) => (
            <option key={s} value={s}>{humanize(s)}</option>
          ))}
        </LabeledSelect>
      </div>
      {error && <Alert>{error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty icon={Megaphone} title="No campaigns here yet" />
      ) : (
        list.items.map((c) => (
          <CampaignCard
            key={c.id}
            c={c}
            actions={!locked(o) && ['REQUESTED', 'APPROVED', 'PAUSED'].includes(c.status) && (
              <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void cancel(c)}>
                <X aria-hidden className="h-4 w-4" /> Cancel
              </Button>
            )}
          />
        ))
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}

// ─── Wallet ───────────────────────────────────────────────────────────

export function WalletTab({ o, onChanged }: { o: PartnerOverview; onChanged: () => void }) {
  const txs = usePagedList<PartnerTx>('/partner/wallet/transactions', {}, { pageSize: 15 });
  const recharges = useAsync(() => api.get<Paged<PartnerRecharge>>('/partner/recharges', { pageSize: 5 }), []);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <WalletHero balance={o.partner.walletBalance} wallet={o.wallet} onRecharge={() => setOpen(true)} locked={locked(o)} />
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total recharged" value={fmtMoney(o.partner.totalRecharged)} tone="green" icon={Wallet} />
        <Stat label="Total spent on passes" value={fmtMoney(o.partner.totalSpent)} tone="pink" icon={Ticket} />
      </div>
      {(recharges.data?.items ?? []).length > 0 && (
        <>
          <SectionTitle icon={Wallet}>Recent recharges</SectionTitle>
          <Card>
            <Table head={['Date', 'Amount', 'Status', 'Reference']}>
              {(recharges.data?.items ?? []).map((r) => (
                <tr key={r.id}>
                  <Td>{fmtDateTime(r.createdAt)}</Td>
                  <Td className="font-semibold">{fmtMoney(r.amount)}</Td>
                  <Td><Badge value={r.status === 'PAID' ? 'SUCCESS' : r.status}>{r.status}</Badge></Td>
                  <Td className="font-mono text-xs">{r.paymentReference ?? '—'}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
      <SectionTitle icon={History}>Wallet history</SectionTitle>
      {txs.loading && !txs.data ? (
        <SkeletonList />
      ) : txs.items.length === 0 ? (
        <Empty icon={History} title="No wallet activity yet" />
      ) : (
        <Card>
          <Table head={['When', 'What', 'Passes', 'Amount', 'Balance']}>
            {txs.items.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</Td>
                <Td>
                  <div className="font-semibold">{TX_LABEL[t.type]}</div>
                  <div className="text-xs text-slate-500">{[t.organization?.name, t.event?.name, t.note].filter(Boolean).join(' · ')}</div>
                </Td>
                <Td>{t.tokenCount ? t.tokenCount : '—'}</Td>
                <Td className={cx('font-bold tabular-nums', Number(t.amount) < 0 ? 'text-red-700' : 'text-green-700')}>
                  {Number(t.amount) > 0 ? '+' : ''}{fmtMoney(t.amount)}
                </Td>
                <Td className="tabular-nums">{fmtMoney(t.balanceAfter)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Pager page={txs.page} pageSize={txs.pageSize} total={txs.total} onPage={txs.setPage} />
      {open && <PartnerRechargeModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); txs.reload(); recharges.reload(); onChanged(); }} />}
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────

export function ProfileTab({ o, onSaved }: { o: PartnerOverview; onSaved: () => void }) {
  const p = o.partner;
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: p.name, legalName: p.legalName ?? '', gstin: p.gstin ?? '', contactName: p.contactName, contactEmail: p.contactEmail, contactPhone: p.contactPhone,
    websiteUrl: p.websiteUrl ?? '', tagline: p.tagline ?? '',
  });
  const [logo, setLogo] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));
  const preview = logo ?? (removeLogo ? null : partnerLogoSrc(p));

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
    setOk(false);
    if (form.name.trim().length < 2) return setError('Enter the brand name.');
    if (form.websiteUrl && !/^https?:\/\//i.test(form.websiteUrl)) return setError('Website must start with https://');
    setBusy(true);
    try {
      await api.patch('/partner/me', { ...form, ...(logo ? { logoDataUrl: logo } : {}), ...(removeLogo ? { removeLogo: true } : {}) });
      setLogo(null);
      setRemoveLogo(false);
      setOk(true);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr] lg:items-start">
      <Card className="flex flex-col items-center gap-3 text-center">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo preview" className="h-32 w-32 rounded-3xl bg-white object-contain ring-1 ring-violet-200" />
        ) : (
          <PartnerLogo p={{ name: form.name || '?', logoUrl: null }} className="h-32 w-32 rounded-3xl text-3xl" />
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={locked(o)}>
            <ImagePlus aria-hidden className="h-4 w-4" /> {preview ? 'Change logo' : 'Upload logo'}
          </Button>
          {preview && (
            <Button variant="ghost" size="sm" className="text-red-700" onClick={() => { setLogo(null); setRemoveLogo(true); }} disabled={locked(o)}>
              Remove
            </Button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <p className="text-xs text-slate-500">PNG, JPG or WebP. Printed small on passes — a simple, square logo works best.</p>
      </Card>
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Brand name" value={form.name} onChange={set('name')} maxLength={120} />
          <LabeledInput label="Legal name (optional)" value={form.legalName} onChange={set('legalName')} maxLength={200} />
          <LabeledInput label="GSTIN (optional)" value={form.gstin} onChange={set('gstin')} maxLength={15} />
          <LabeledInput label="Website" type="url" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" />
        </div>
        <LabeledInput label="Tagline" value={form.tagline} onChange={set('tagline')} maxLength={120} hint="Shown under your name; also the default promo line for new campaigns." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <LabeledInput label="Contact person" value={form.contactName} onChange={set('contactName')} />
          <LabeledInput label="Contact email" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
          <LabeledInput label="Contact phone" type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
        </div>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">Profile saved.</Alert>}
        <div>
          <Button type="submit" loading={busy} disabled={locked(o)}>
            <Save aria-hidden className="h-4 w-4" /> Save profile
          </Button>
        </div>
      </Card>
    </form>
  );
}
