'use client';

import { useState } from 'react';
import { Pencil, Plus, Store, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useEvent } from '@/lib/event-context';
import { can } from '@/lib/permissions';
import { usePagedList } from '@/lib/paged';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { STALL_CATEGORIES, STALL_CATEGORY_LABEL, type StallBooking, type StallBookingStatus, type StallCategory, type StallOverview, type StallTypeInfo } from '@/lib/stall-types';
import { SearchBar } from '../SearchBar';
import { BookingStatusBadge } from '../vendor/VendorParts';
import { Alert, Button, Card, Checkbox, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Textarea } from '../ui';

/**
 * Festival dashboard → Stalls: stall types (count + price), switching vendor
 * booking on, and the bookings vendors paid for (assign stall numbers).
 */
export function StallsTab() {
  const ev = useEvent();
  const manage = can(ev.perms, 'STALL_MANAGE');
  const base = `/events/${ev.eventId}`;
  const q = useAsync(() => api.get<StallOverview>(`${base}/stalls`), [base]);
  const [editing, setEditing] = useState<StallTypeInfo | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settings(body: { enabled?: boolean; gstPercent?: string }) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${base}/stalls`, body);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.error) return <Alert>{q.error}</Alert>;
  if (!q.data) return <SkeletonList rows={3} />;
  const o = q.data;
  const total = o.types.reduce((n, t) => n + t.totalCount, 0);
  const booked = o.types.reduce((n, t) => n + t.booked, 0);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Store}>Stall booking</SectionTitle>
        <p className="-mt-2 text-sm text-slate-600">
          Vendors with a Parvsetu vendor account book and pay for stalls online. A booking holds its stalls for 15 minutes while the vendor pays, so a stall type is
          never oversold. The platform fee is {o.platformFeePercent}% of the stall rent (before GST); the rest reaches you through your normal payouts.
        </p>
        {!o.live && <Alert kind="warning">Vendors can only see this festival once it is live and active.</Alert>}
        {!o.payoutsReady && <Alert kind="warning">Add and verify your payout bank account (Mandal admin → Payouts &amp; bank) before vendors can pay.</Alert>}
        {!o.onlinePayments && <Alert kind="warning">Online payments aren’t switched on for the platform yet.</Alert>}
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox label="Open stall booking to vendors" checked={o.enabled} disabled={!manage || busy} onChange={(v) => void settings({ enabled: v })} />
          {o.gstEnabled ? (
            <label className="flex items-center gap-2 text-sm font-semibold">
              GST on stall rent
              <select className="min-h-[40px] rounded-xl border border-orange-200 px-2" value={o.gstPercent} disabled={!manage || busy} onChange={(e) => void settings({ gstPercent: e.target.value })}>
                {['0', '5', '12', '18', '28'].map((g) => <option key={g} value={g}>{g}%</option>)}
              </select>
            </label>
          ) : (
            <span className="text-xs text-slate-500">GST is off for this festival, so stall rent has no GST.</span>
          )}
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Stalls booked" value={`${booked} / ${total}`} tone="brand" />
          <Stat label="Paid bookings" value={o.totals.paidBookings} tone="green" />
          <Stat label="Collected" value={fmtMoney(o.totals.collected)} tone="blue" />
          <Stat label="Platform fees" value={fmtMoney(o.totals.platformFees)} tone="slate" />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Store} action={manage ? <Button size="sm" onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add stall type</Button> : undefined}>
          Stall types
        </SectionTitle>
        {o.types.length === 0 ? (
          <Empty title="No stall types yet" icon={Store}>Add e.g. “Food stall · 10 × 10 ft · ₹5,000 · 20 stalls”, then open booking.</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {o.types.map((t) => (
              <li key={t.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-orange-100 p-3 ${t.isActive ? '' : 'bg-slate-50'}`}>
                <div className="min-w-0 flex-1">
                  <p className={`font-bold ${t.isActive ? '' : 'text-slate-500'}`}>{t.name}{t.isActive ? '' : ' · off'}</p>
                  <p className="text-xs text-slate-500">{[STALL_CATEGORY_LABEL[t.category], t.size, `${fmtMoney(t.price)} each`].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="w-40">
                  <div className="h-2 overflow-hidden rounded-full bg-orange-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${t.totalCount ? Math.min(100, (t.booked / t.totalCount) * 100) : 0}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-slate-600">{t.booked} booked · {t.available} left of {t.totalCount}</p>
                </div>
                {manage && <Button variant="ghost" size="sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil aria-hidden className="h-4 w-4" /></Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Bookings base={base} manage={manage} types={o.types} />
      {editing && <TypeModal base={base} t={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.reload(); }} />}
    </div>
  );
}

function TypeModal({ base, t, onClose, onSaved }: { base: string; t: StallTypeInfo | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: t?.name ?? '', category: (t?.category ?? 'FOOD') as StallCategory, size: t?.size ?? '', price: t ? String(Number(t.price)) : '',
    totalCount: t ? String(t.totalCount) : '', description: t?.description ?? '', isActive: t?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      name: f.name.trim(), category: f.category, size: f.size.trim() || null, price: f.price.trim(), totalCount: Number(f.totalCount),
      description: f.description.trim() || null, isActive: f.isActive,
    };
    void run(() => (t ? api.patch(`${base}/stall-types/${t.id}`, body) : api.post(`${base}/stall-types`, body)));
  }
  return (
    <Modal open onClose={onClose} title={t ? 'Edit stall type' : 'Add stall type'}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <LabeledInput label="Name" required maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Food stall" />
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledSelect label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as StallCategory })}>
            {STALL_CATEGORIES.map((c) => <option key={c} value={c}>{STALL_CATEGORY_LABEL[c]}</option>)}
          </LabeledSelect>
          <LabeledInput label="Size (optional)" maxLength={40} value={f.size} onChange={(e) => setF({ ...f, size: e.target.value })} placeholder="10 × 10 ft" />
          <LabeledInput label="Price per stall (₹)" required inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} placeholder="5000" />
          <LabeledInput label="Number of stalls" required inputMode="numeric" value={f.totalCount} onChange={(e) => setF({ ...f, totalCount: e.target.value.replace(/\D/g, '') })} hint={t ? `${t.booked} already booked or being paid for` : undefined} />
        </div>
        <Field label="Description (optional)" hint="What’s included — table, power point, water…">
          <Textarea rows={2} maxLength={500} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Checkbox label="Vendors can book this type" checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} />
        {t && <p className="text-xs text-slate-500">A new price applies to new bookings only.</p>}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>{t ? 'Save' : 'Add'}</Button>
          {t && t.booked === 0 && (
            <Button variant="ghost" className="ml-auto text-red-700" disabled={busy} onClick={() => confirm(`Delete “${t.name}”?`) && void run(() => api.del(`${base}/stall-types/${t.id}`))}>
              <Trash2 aria-hidden className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

const STATUS_FILTERS: { key: StallBookingStatus | ''; label: string }[] = [
  { key: 'PAID', label: 'Confirmed' },
  { key: 'PENDING', label: 'Awaiting payment' },
  { key: '', label: 'All' },
];

function Bookings({ base, manage, types }: { base: string; manage: boolean; types: StallTypeInfo[] }) {
  const [status, setStatus] = useState<StallBookingStatus | ''>('PAID');
  const [typeId, setTypeId] = useState('');
  const q = usePagedList<StallBooking>(`${base}/stall-bookings`, { status: status || undefined, stallTypeId: typeId || undefined }, { pageSize: 20 });
  const [assigning, setAssigning] = useState<StallBooking | null>(null);
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={Store}>Vendor bookings</SectionTitle>
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button key={f.key || 'all'} type="button" aria-pressed={status === f.key} onClick={() => setStatus(f.key)} className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${status === f.key ? 'border-orange-500 bg-orange-500 text-white' : 'border-orange-200 bg-white'}`}>
            {f.label}
          </button>
        ))}
        {types.length > 1 && (
          <select aria-label="Stall type" className="min-h-[40px] rounded-xl border border-orange-200 px-2 text-sm" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">All stall types</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search business, contact, invoice or stall no." />
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={2} />
      ) : !q.items.length ? (
        <p className="rounded-xl border border-dashed border-orange-200 p-4 text-center text-sm text-slate-500">No bookings here yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {q.items.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 rounded-xl border border-orange-100 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold">{b.businessName}</p>
                  <p className="text-xs text-slate-500">{b.contactName} · <a href={`tel:${b.contactPhone}`} className="underline">{b.contactPhone}</a>{b.contactEmail ? ` · ${b.contactEmail}` : ''}</p>
                </div>
                <BookingStatusBadge status={b.status} />
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-5">
                <div><dt className="text-xs text-slate-500">Stalls</dt><dd className="font-semibold">{b.quantity} × {b.stallType.name}</dd></div>
                <div><dt className="text-xs text-slate-500">Paid</dt><dd className="font-semibold">{fmtMoney(b.amount)}</dd></div>
                <div><dt className="text-xs text-slate-500">Platform fee</dt><dd>{fmtMoney(b.platformFee)} ({b.commissionPercent}%)</dd></div>
                <div><dt className="text-xs text-slate-500">Invoice</dt><dd>{b.invoiceNo ?? '—'}</dd></div>
                <div><dt className="text-xs text-slate-500">Stall no.</dt><dd className="font-semibold">{b.stallNumbers ?? '—'}</dd></div>
              </dl>
              {b.products && <p className="text-sm text-slate-600">Selling: {b.products}</p>}
              {b.mandalNote && <p className="text-xs text-slate-500">Note to vendor: {b.mandalNote}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>{b.paidAt ? `Paid ${fmtDateTime(b.paidAt)}` : `Booked ${fmtDateTime(b.createdAt)}`}</span>
                {manage && b.status === 'PAID' && (
                  <Button size="sm" variant="secondary" onClick={() => setAssigning(b)}>{b.stallNumbers ? 'Change stall no.' : 'Assign stall no.'}</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {assigning && <AssignModal base={base} b={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); q.reload(); }} />}
    </Card>
  );
}

function AssignModal({ base, b, onClose, onSaved }: { base: string; b: StallBooking; onClose: () => void; onSaved: () => void }) {
  const [numbers, setNumbers] = useState(b.stallNumbers ?? '');
  const [note, setNote] = useState(b.mandalNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${base}/stall-bookings/${b.id}`, { stallNumbers: numbers.trim() || null, mandalNote: note.trim() || null });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Stall number · ${b.businessName}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <LabeledInput label={`Stall number${b.quantity > 1 ? `s (${b.quantity})` : ''}`} maxLength={200} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={b.quantity > 1 ? 'e.g. F-04, F-05' : 'e.g. F-04'} />
        <Field label="Note to the vendor (optional)" hint="Shown in the vendor’s bookings, e.g. reporting time or gate.">
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Modal>
  );
}
