'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, MapPin, Search, Store, Ticket, UserRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync, useDebounced } from '@/lib/hooks';
import { fmtMoney } from '@/lib/format';
import type { Paged } from '@/lib/types';
import {
  STALL_CATEGORIES, STALL_CATEGORY_LABEL, type StallBooking, type StallBookingStatus, type StallCategory, type StallTypeInfo, type VendorFestival,
  type VendorFestivalDetail, type VendorProfile,
} from '@/lib/stall-types';
import { AppShell } from '@/components/AppShell';
import { Mandala } from '@/components/FestivalArt';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Alert, Badge, Button, Card, Empty, Field, Input, LabeledInput, LabeledSelect, Modal, Pager, SideTabsLayout, SkeletonList, Textarea } from '@/components/ui';
import { BookingCard, BookingStatusBadge, StallPayModal, StallTypeCard, range } from '@/components/vendor/VendorParts';

const TABS = [
  { key: 'book', label: 'Book a stall', icon: Store },
  { key: 'bookings', label: 'My bookings', icon: Ticket },
  { key: 'profile', label: 'Business profile', icon: UserRound },
];

/** Stall-vendor dashboard: find festivals, book & pay for stalls, track bookings. */
export default function VendorPage() {
  const { me } = useAuth();
  const isVendor = !!me?.vendor;
  const profile = useAsync(() => api.get<VendorProfile>('/vendor/profile'), [], isVendor);
  const [tab, setTab] = useState('book');
  const [paying, setPaying] = useState<StallBooking | null>(null);
  const [bookingsKey, setBookingsKey] = useState(0);

  // ?festival=<id> (from a festival page's "Book a stall") opens that festival's stalls.
  const [festival, setFestival] = useState<string | null>(null);
  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (TABS.some((t) => t.key === h)) setTab(h);
    const f = new URLSearchParams(window.location.search).get('festival');
    if (f && /^[0-9a-f-]{36}$/i.test(f)) {
      setFestival(f);
      setTab('book');
    }
  }, []);
  function change(k: string) {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {
      /* ignore */
    }
  }

  const p = profile.data;
  return (
    <AppShell title={me?.vendor?.businessName ?? 'Stall vendor'} subtitle="Stall vendor" wide>
      {me && !isVendor ? (
        <Alert kind="warning">
          This area is for stall vendor accounts. <Link href="/vendor/signup" className="font-semibold underline">Create a vendor account</Link>
        </Alert>
      ) : profile.error ? (
        <Alert>{profile.error}</Alert>
      ) : !p ? (
        <SkeletonList />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-500 via-emerald-600 to-cyan-700 text-white shadow-lg">
            <Mandala className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 text-white/15" />
            <div className="relative flex items-center gap-4 p-5">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40"><Store aria-hidden className="h-7 w-7" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Stall vendor</p>
                <h1 className="truncate text-2xl font-extrabold">{p.businessName}</h1>
                <p className="truncate text-sm text-white/90">{[p.category && STALL_CATEGORY_LABEL[p.category], p.city].filter(Boolean).join(' · ') || 'Book stalls at festivals and melas'}</p>
              </div>
              <Badge value={p.status}>{p.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>
            </div>
          </section>
          {p.status === 'SUSPENDED' && (
            <Alert kind="warning">Your vendor account is suspended{p.statusNote ? ` — ${p.statusNote}` : ''}. You can see your bookings but can’t book new stalls. Contact the Parvsetu team.</Alert>
          )}
          <SideTabsLayout tabs={TABS} active={tab} onChange={change}>
            {tab === 'book' ? (
              <BookTab key={festival ?? ''} initial={festival} profile={p} onBooked={(b) => setPaying(b)} />
            ) : tab === 'bookings' ? (
              <BookingsTab key={bookingsKey} onPay={setPaying} />
            ) : (
              <ProfileTab profile={p} onSaved={profile.reload} />
            )}
          </SideTabsLayout>
          {paying && (
            <StallPayModal
              booking={paying}
              onClose={() => {
                setPaying(null);
                setBookingsKey((k) => k + 1);
                change('bookings');
              }}
              onDone={() => setBookingsKey((k) => k + 1)}
            />
          )}
        </div>
      )}
    </AppShell>
  );
}

// ─── Book a stall ──────────────────────────────────────────────────────

function BookTab({ initial, profile, onBooked }: { initial: string | null; profile: VendorProfile; onBooked: (b: StallBooking) => void }) {
  const [open, setOpen] = useState<string | null>(initial);
  if (open) return <FestivalStalls eventId={open} profile={profile} onBack={() => setOpen(null)} onBooked={onBooked} />;
  return <FestivalList onOpen={setOpen} />;
}

function FestivalList({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const term = useDebounced(q.trim());
  useEffect(() => setPage(1), [term]);
  const list = useAsync(() => api.get<Paged<VendorFestival>>('/vendor/festivals', { q: term || undefined, page, pageSize: 12 }), [term, page]);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <Input className="pl-10" placeholder="Search festival, mandal or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search festivals" />
      </div>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList rows={3} />
      ) : !list.data?.items.length ? (
        <Empty title={term ? 'No festivals match' : 'No festivals are taking stall bookings right now'} icon={Store}>
          Festivals appear here when a mandal opens stall booking. Check back soon.
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.data.items.map((f) => (
            <button key={f.id} type="button" onClick={() => onOpen(f.id)} className="flex flex-col gap-2 rounded-2xl border border-teal-100 bg-white p-4 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md">
              <div className="flex items-center gap-3">
                <FestivalBadge type={f.festivalType} className="h-11 w-11" />
                <div className="min-w-0">
                  <p className="truncate font-bold">{f.name}</p>
                  <p className="truncate text-xs text-slate-500">{f.organization.name}</p>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays aria-hidden className="h-4 w-4" /> {range(f.startDate, f.endDate)}</p>
              {(f.venue.city || f.venue.name) && <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin aria-hidden className="h-4 w-4" /> {[f.venue.name, f.venue.city].filter(Boolean).join(', ')}</p>}
              <div className="flex flex-wrap gap-1">
                {f.categories.map((c) => <span key={c} className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">{STALL_CATEGORY_LABEL[c]}</span>)}
              </div>
              <p className="mt-auto flex items-center justify-between text-sm">
                <span className={f.stallsAvailable ? 'font-semibold text-teal-700' : 'font-semibold text-slate-500'}>{f.stallsAvailable ? `${f.stallsAvailable} stalls left` : 'Sold out'}</span>
                {f.fromPrice && <span className="font-bold">from {fmtMoney(f.fromPrice)}</span>}
              </p>
            </button>
          ))}
        </div>
      )}
      {list.data && <Pager page={page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />}
    </div>
  );
}

function FestivalStalls({ eventId, profile, onBack, onBooked }: { eventId: string; profile: VendorProfile; onBack: () => void; onBooked: (b: StallBooking) => void }) {
  const f = useAsync(() => api.get<VendorFestivalDetail>(`/vendor/festivals/${eventId}`), [eventId]);
  const [cat, setCat] = useState<StallCategory | ''>('');
  const [choosing, setChoosing] = useState<StallTypeInfo | null>(null);
  const d = f.data;
  const types = (d?.types ?? []).filter((t) => !cat || t.category === cat);
  const cats = STALL_CATEGORIES.filter((c) => d?.types.some((t) => t.category === c));
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" size="sm" className="w-fit" onClick={onBack}><ArrowLeft aria-hidden className="h-4 w-4" /> All festivals</Button>
      {f.error && <Alert>{f.error}</Alert>}
      {!d ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <Card className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <FestivalBadge type={d.festivalType} className="h-12 w-12" />
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold">{d.name}</h2>
                <p className="text-sm text-slate-600">{d.organization.name} · {range(d.startDate, d.endDate)}</p>
              </div>
            </div>
            {d.venue.fullAddress && (
              <p className="flex items-start gap-1.5 text-sm text-slate-600">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                {d.venue.mapUrl ? <a href={d.venue.mapUrl} target="_blank" rel="noopener noreferrer" className="underline">{d.venue.fullAddress}</a> : d.venue.fullAddress}
              </p>
            )}
            {d.description && <p className="line-clamp-3 text-sm text-slate-600">{d.description}</p>}
            {d.gstPercent && Number(d.gstPercent) > 0 && <p className="text-xs text-slate-500">Prices are before GST ({d.gstPercent}%), which is added at checkout.</p>}
            {!d.bookable && <Alert kind="warning">This festival isn’t taking online stall payments right now.</Alert>}
          </Card>
          {cats.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {(['', ...cats] as (StallCategory | '')[]).map((c) => (
                <button key={c || 'all'} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${cat === c ? 'border-teal-600 bg-teal-600 text-white' : 'border-teal-200 bg-white'}`}>
                  {c ? STALL_CATEGORY_LABEL[c] : 'All'}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {types.map((t) => (
              <StallTypeCard
                key={t.id}
                t={t}
                action={
                  <Button size="sm" className="mt-auto" disabled={!d.bookable || t.available <= 0 || profile.status !== 'ACTIVE'} onClick={() => setChoosing(t)}>
                    <Store aria-hidden className="h-4 w-4" /> {t.available <= 0 ? 'Sold out' : 'Book this stall'}
                  </Button>
                }
              />
            ))}
          </div>
          {choosing && (
            <BookModal
              type={choosing}
              festival={d}
              profile={profile}
              onClose={() => setChoosing(null)}
              onBooked={(b) => {
                setChoosing(null);
                f.reload();
                onBooked(b);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

function BookModal({ type, festival, profile, onClose, onBooked }: { type: StallTypeInfo; festival: VendorFestivalDetail; profile: VendorProfile; onClose: () => void; onBooked: (b: StallBooking) => void }) {
  const max = Math.min(10, type.available);
  const [f, setF] = useState({ quantity: 1, businessName: profile.businessName, contactName: profile.contactName, contactPhone: profile.contactPhone, contactEmail: profile.contactEmail, products: profile.description ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = Number(type.price) * f.quantity;
  const gst = festival.gstPercent ? Math.round(base * Number(festival.gstPercent)) / 100 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const b = await api.post<StallBooking>('/vendor/bookings', {
        stallTypeId: type.id, quantity: f.quantity, businessName: f.businessName.trim(), contactName: f.contactName.trim(), contactPhone: f.contactPhone.replace(/\s/g, ''),
        contactEmail: f.contactEmail.trim() || undefined, products: f.products.trim() || undefined,
      });
      onBooked(b);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Book: ${type.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">{festival.name} · {range(festival.startDate, festival.endDate)} · {type.available} left</p>
        <LabeledSelect label="Number of stalls" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })}>
          {Array.from({ length: Math.max(1, max) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
        </LabeledSelect>
        <LabeledInput label="Name on the stall" required maxLength={120} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledInput label="Contact person" required maxLength={100} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <LabeledInput label="Contact mobile" type="tel" required value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
        </div>
        <LabeledInput label="Contact email (optional)" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
        <Field label="What will you sell or show?" hint="Helps the mandal plan the layout.">
          <Textarea rows={2} maxLength={500} value={f.products} onChange={(e) => setF({ ...f, products: e.target.value })} placeholder="e.g. Pani puri, bhel, sev puri" />
        </Field>
        <dl className="grid grid-cols-2 gap-y-1 rounded-xl bg-teal-50 p-3 text-sm">
          <dt className="text-slate-600">{f.quantity} × {fmtMoney(type.price)}</dt><dd className="text-right">{fmtMoney(base)}</dd>
          {gst > 0 && (<><dt className="text-slate-600">GST {festival.gstPercent}%</dt><dd className="text-right">{fmtMoney(gst)}</dd></>)}
          <dt className="font-bold">Total</dt><dd className="text-right font-black">{fmtMoney(base + gst)}</dd>
        </dl>
        <p className="text-xs text-slate-500">The stalls are held for 15 minutes while you pay. Online payment only; bookings can’t be cancelled online — contact the mandal if plans change.</p>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}><Store aria-hidden className="h-4 w-4" /> Continue to payment</Button>
      </form>
    </Modal>
  );
}

// ─── My bookings ───────────────────────────────────────────────────────

const FILTERS: { key: StallBookingStatus | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'PAID', label: 'Confirmed' },
  { key: 'PENDING', label: 'Awaiting payment' },
  { key: 'FAILED', label: 'Failed' },
  { key: 'EXPIRED', label: 'Expired' },
];

function BookingsTab({ onPay }: { onPay: (b: StallBooking) => void }) {
  const [status, setStatus] = useState<StallBookingStatus | ''>('');
  const [page, setPage] = useState(1);
  const q = useAsync(() => api.get<Paged<StallBooking>>('/vendor/bookings', { status: status || undefined, page, pageSize: 10 }), [status, page]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} type="button" aria-pressed={status === f.key} onClick={() => { setStatus(f.key); setPage(1); }} className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${status === f.key ? 'border-teal-600 bg-teal-600 text-white' : 'border-teal-200 bg-white'}`}>
            {f.key ? <BookingStatusBadge status={f.key} /> : f.label}
          </button>
        ))}
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={3} />
      ) : !q.data?.items.length ? (
        <Empty title="No bookings yet" icon={Ticket}>Book a stall at a festival and it will show up here.</Empty>
      ) : (
        q.data.items.map((b) => <BookingCard key={b.id} b={b} onPay={() => onPay(b)} />)
      )}
      {q.data && <Pager page={page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
    </div>
  );
}

// ─── Profile ───────────────────────────────────────────────────────────

function ProfileTab({ profile, onSaved }: { profile: VendorProfile; onSaved: () => void }) {
  const [f, setF] = useState({
    businessName: profile.businessName, contactName: profile.contactName, contactPhone: profile.contactPhone,
    category: profile.category ?? '', city: profile.city ?? '', gstin: profile.gstin ?? '', description: profile.description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    try {
      await api.patch('/vendor/profile', {
        businessName: f.businessName.trim(), contactName: f.contactName.trim(), contactPhone: f.contactPhone.replace(/\s/g, ''),
        category: f.category || null, city: f.city.trim() || null, gstin: f.gstin.trim() || null, description: f.description.trim() || null,
      });
      setOk(true);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const locked = profile.status !== 'ACTIVE';
  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-3">
        <fieldset disabled={locked} className="flex flex-col gap-3">
          <LabeledInput label="Business / stall name" required maxLength={120} value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Contact person" required maxLength={100} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
            <LabeledInput label="Contact mobile" type="tel" required value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
            <LabeledSelect label="What you sell" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              <option value="">—</option>
              {STALL_CATEGORIES.map((c) => <option key={c} value={c}>{STALL_CATEGORY_LABEL[c]}</option>)}
            </LabeledSelect>
            <LabeledInput label="City" maxLength={80} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </div>
          <LabeledInput label="GSTIN (optional)" maxLength={15} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} />
          <Field label="About your stall" hint="Pre-filled as “what you’ll sell” when you book.">
            <Textarea rows={3} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <p className="text-xs text-slate-500">Login email: {profile.contactEmail}</p>
        </fieldset>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">Saved.</Alert>}
        {!locked && <Button type="submit" loading={busy}>Save profile</Button>}
      </form>
    </Card>
  );
}
