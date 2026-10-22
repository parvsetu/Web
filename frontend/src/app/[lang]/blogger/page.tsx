'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  BadgeIndianRupee, CalendarDays, Check, CheckCircle2, Copy, Hourglass, LayoutDashboard, Megaphone, MessageCircle, Plus, Save, Ticket, UserRound, Users, Wallet, XCircle,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import {
  BLOGGER_STATUS_LABEL, PROMOTION_STATUS_LABEL, PROMOTION_TONE, type Blogger, type BloggerLedgerRow, type BloggerOverview, type BloggerPayoutRow, type Promotion,
} from '@/lib/referral-types';
import { AppShell } from '@/components/AppShell';
import { Mandala } from '@/components/FestivalArt';
import { FestivalBadge } from '@/components/FestivalBanner';
import { FestivalPicker } from '@/components/blogger/FestivalPicker';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, Pager, SectionTitle, SideTabsLayout, SkeletonList, Stat, Table, Td, Textarea, cx } from '@/components/ui';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'festivals', label: 'My festivals & links', icon: Megaphone },
  { key: 'earnings', label: 'Earnings', icon: Wallet },
  { key: 'profile', label: 'Profile', icon: UserRound },
];

/** Blogger / influencer dashboard: referral links per festival, bookings they brought, commission and payouts. */
export default function BloggerPage() {
  const { me } = useAuth();
  const isBlogger = !!me?.blogger;
  const overview = useAsync(() => api.get<BloggerOverview>('/blogger/me'), [], isBlogger);
  const promotions = useAsync(() => api.get<Promotion[]>('/blogger/promotions'), [], isBlogger);
  const [tab, setTab] = useState('overview');
  const o = overview.data;

  useEffect(() => {
    const h = window.location.hash.replace('#', '');
    if (TABS.some((t) => t.key === h)) setTab(h);
  }, []);
  function change(k: string) {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {
      /* ignore */
    }
  }
  const reload = () => {
    overview.reload();
    promotions.reload();
  };

  return (
    <AppShell title={me?.blogger?.name ?? 'Blogger'} subtitle="Parvsetu blogger" wide>
      {me && !isBlogger ? (
        <Alert kind="warning">
          This area is for blogger and influencer accounts. <Link href="/blogger/signup" className="font-semibold underline">Apply as a blogger</Link>
        </Alert>
      ) : overview.error ? (
        <Alert>{overview.error}</Alert>
      ) : !o ? (
        <SkeletonList />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-fuchsia-500 via-pink-600 to-rose-600 text-white shadow-lg">
            <Mandala className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 text-white/15" />
            <div className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Blogger · {BLOGGER_STATUS_LABEL[o.blogger.status]}</p>
                <h1 className="break-words text-2xl font-extrabold leading-tight">{o.blogger.name}</h1>
                <p className="text-sm text-white/90">{[o.blogger.instagramHandle, o.blogger.youtubeUrl ? 'YouTube' : null, o.blogger.blogUrl ? 'Blog' : null].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-72">
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Due to you</p>
                  <p className="text-xl font-black tabular-nums">{fmtMoney(o.earnings.due)}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Paid bookings</p>
                  <p className="text-xl font-black tabular-nums">{o.stats.paidBookings}</p>
                </div>
              </div>
            </div>
          </section>
          <StatusBanner b={o.blogger} />
          <SideTabsLayout tabs={TABS} active={tab} onChange={change}>
            {tab === 'overview' ? (
              <OverviewTab o={o} promotions={promotions.data ?? []} onFestivals={() => change('festivals')} />
            ) : tab === 'festivals' ? (
              <FestivalsTab promotions={promotions.data} error={promotions.error} canRequest={o.blogger.status === 'ACTIVE' || o.blogger.status === 'PENDING'} onChanged={reload} />
            ) : tab === 'earnings' ? (
              <EarningsTab o={o} />
            ) : (
              <ProfileTab b={o.blogger} canEdit={o.blogger.status === 'ACTIVE' || o.blogger.status === 'PENDING'} onSaved={reload} />
            )}
          </SideTabsLayout>
        </div>
      )}
    </AppShell>
  );
}

function StatusBanner({ b }: { b: Blogger }) {
  if (b.status === 'PENDING') return <Alert kind="info">Thanks for applying! The Parvsetu team is reviewing your account. Once it’s approved, each festival you picked is reviewed and gets its own referral link.</Alert>;
  if (b.status === 'REJECTED') return <Alert kind="warning">Your blogger application was not approved{b.reviewNote ? ` — ${b.reviewNote}` : ''}.</Alert>;
  if (b.status === 'SUSPENDED') return <Alert kind="warning">Your account is suspended{b.reviewNote ? ` — ${b.reviewNote}` : ''}. Your links don’t earn commission until it is re-activated. Contact the Parvsetu team.</Alert>;
  return null;
}

function OverviewTab({ o, promotions, onFestivals }: { o: BloggerOverview; promotions: Promotion[]; onFestivals: () => void }) {
  const live = promotions.filter((p) => p.status === 'APPROVED' && p.link);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Festivals approved" value={o.stats.approved} tone="green" icon={CheckCircle2} />
        <Stat label="Waiting for review" value={o.stats.pending} tone="amber" icon={Hourglass} />
        <Stat label="Paid bookings" value={o.stats.paidBookings} tone="blue" icon={Ticket} />
        <Stat label="Visitors brought" value={o.stats.visitors} tone="purple" icon={Users} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
        <Stat label="Paid to you" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
        <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
      </div>
      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Megaphone} action={<Button size="sm" variant="secondary" onClick={onFestivals}>All festivals</Button>}>Your live links</SectionTitle>
        {live.length === 0 ? (
          <p className="text-sm text-slate-600">No approved festivals yet. Your referral links appear here once the Parvsetu team approves a festival for you.</p>
        ) : (
          live.slice(0, 3).map((p) => <LinkBox key={p.id} p={p} />)
        )}
      </Card>
      <Card className="flex flex-col gap-2 text-sm text-slate-700">
        <p className="flex items-start gap-2"><BadgeIndianRupee aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-pink-600" /> <span>You earn <strong>{o.defaultCommission.label}</strong> for every paid booking made through your link or code (a festival can have its own rate).</span></p>
        <p className="text-xs text-slate-500">Commission is credited once the visitor’s payment succeeds. Free passes don’t earn, and if every pass in a booking is cancelled the commission is reversed. Bookings made with your own mobile number or email don’t count. Payouts are made by the Parvsetu team.</p>
      </Card>
    </div>
  );
}

function LinkBox({ p }: { p: Promotion }) {
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const copy = async (what: 'link' | 'code') => {
    const v = what === 'link' ? p.link! : p.code!;
    try {
      await navigator.clipboard.writeText(v);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt('Copy', v);
    }
  };
  const share = `🎉 ${p.event.name} — book your passes here:`;
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-pink-50/60 p-3 ring-1 ring-pink-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 break-words font-semibold">{p.event.name}</span>
        <span className="rounded-md bg-white px-2 py-0.5 font-mono text-sm font-bold tracking-wider text-pink-800 ring-1 ring-pink-200">{p.code}</span>
      </div>
      <div className="break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 ring-1 ring-pink-100">{p.link}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <a href={`https://wa.me/?text=${encodeURIComponent(`${share} ${p.link}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white">
          <MessageCircle aria-hidden className="h-4 w-4" /> WhatsApp
        </a>
        <button type="button" onClick={() => void copy('link')} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-3 text-sm font-semibold">
          {copied === 'link' ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />} {copied === 'link' ? 'Copied' : 'Copy link'}
        </button>
        <button type="button" onClick={() => void copy('code')} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-pink-200 bg-white px-3 text-sm font-semibold">
          {copied === 'code' ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />} {copied === 'code' ? 'Copied' : 'Copy code'}
        </button>
      </div>
    </div>
  );
}

function FestivalsTab({ promotions, error, canRequest, onChanged }: { promotions: Promotion[] | null; error: string | null; canRequest: boolean; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function request() {
    setBusy(true);
    setMsg(null);
    const failed: string[] = [];
    for (const eventId of picked) {
      try {
        await api.post('/blogger/promotions', { eventId });
      } catch (e) {
        failed.push(errorMessage(e));
      }
    }
    setBusy(false);
    setMsg(failed.length ? { kind: 'error', text: failed.join(' ') } : { kind: 'success', text: 'Sent for review. You’ll get an email when it’s decided.' });
    setPicked([]);
    setAdding(false);
    onChanged();
  }

  if (error) return <Alert>{error}</Alert>;
  if (!promotions) return <SkeletonList />;
  const pendingOrLive = promotions.filter((p) => p.status === 'PENDING' || p.status === 'APPROVED').map((p) => p.event.id);
  return (
    <div className="flex flex-col gap-3">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {canRequest && (
        adding ? (
          <Card className="flex flex-col gap-3">
            <SectionTitle icon={Plus}>Promote more festivals</SectionTitle>
            <FestivalPicker selected={picked} onChange={setPicked} exclude={pendingOrLive} />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
              <Button loading={busy} disabled={picked.length === 0} onClick={() => void request()}>Send for review</Button>
            </div>
          </Card>
        ) : (
          <div className="flex justify-end"><Button onClick={() => setAdding(true)}><Plus aria-hidden className="h-4 w-4" /> Promote another festival</Button></div>
        )
      )}
      {promotions.length === 0 ? (
        <Empty icon={Megaphone} title="No festivals yet">Pick the festivals you want to promote.</Empty>
      ) : (
        promotions.map((p) => (
          <Card key={p.id} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <FestivalBadge type={p.event.festivalType} className="h-11 w-11 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{p.event.name}</p>
                <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" /> {fmtDate(p.event.startDate)} – {fmtDate(p.event.endDate)} · {p.event.organization.name}{p.event.city ? `, ${p.event.city}` : ''}</p>
              </div>
              <Badge className={PROMOTION_TONE[p.status]}>{PROMOTION_STATUS_LABEL[p.status]}</Badge>
            </div>
            {p.reviewNote && p.status !== 'APPROVED' && (
              <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">{p.status === 'REJECTED' && <XCircle aria-hidden className="mr-1 inline h-4 w-4" />}Note: {p.reviewNote}</p>
            )}
            {p.status === 'APPROVED' && p.link && <LinkBox p={p} />}
            {p.status === 'APPROVED' && !p.event.publicBookingEnabled && <p className="text-xs text-amber-800">The mandal hasn’t opened online booking yet — your link starts earning once it does.</p>}
            {(p.status === 'APPROVED' || p.status === 'REVOKED') && (
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                <Mini label="Referrals" value={String(p.stats.referrals)} />
                <Mini label="Paid bookings" value={String(p.stats.paidBookings)} />
                <Mini label="Visitors" value={String(p.stats.visitors)} />
                <Mini label="Commission" value={fmtMoney(p.stats.commissionNet)} strong />
              </div>
            )}
            {p.status === 'APPROVED' && <p className="text-xs text-slate-500">You earn {p.commission.label} per paid booking.</p>}
          </Card>
        ))
      )}
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('min-w-0 rounded-xl px-1.5 py-2', strong ? 'bg-pink-50 ring-1 ring-pink-200' : 'bg-slate-50')}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('break-words text-sm font-bold tabular-nums', strong ? 'text-pink-800' : 'text-slate-800')}>{value}</p>
    </div>
  );
}

function EarningsTab({ o }: { o: BloggerOverview }) {
  const ledger = usePagedList<BloggerLedgerRow>('/blogger/ledger', {}, { pageSize: 20 });
  const payouts = usePagedList<BloggerPayoutRow>('/blogger/payouts', {}, { pageSize: 10 });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
        <Stat label="Paid to you" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
        <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
      </div>
      {Number(o.earnings.reversed) > 0 && <p className="text-xs text-slate-500">{fmtMoney(o.earnings.reversed)} was reversed because bookings were cancelled or refunded.</p>}
      <SectionTitle icon={BadgeIndianRupee}>Earnings history</SectionTitle>
      {ledger.items.length === 0 ? (
        <Empty title="No earnings yet">You earn when someone pays for passes through your link.</Empty>
      ) : (
        <Card>
          <Table head={['When', 'What', 'Festival / booking', 'Amount']}>
            {ledger.items.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                <Td className="text-xs">
                  {r.type === 'PAID' ? 'Payout' : r.type === 'REVERSED' ? 'Reversed' : 'Commission'}
                  {r.reversed && <Badge className="ml-1 bg-slate-100 text-slate-600">reversed</Badge>}
                </Td>
                <Td className="text-xs">
                  {r.type === 'PAID' ? r.note : [r.event?.name, r.booking ? `${r.booking.invoiceNo ?? 'booking'} · ${r.booking.visitors} ${r.booking.visitors === 1 ? 'person' : 'people'}` : null].filter(Boolean).join(' · ')}
                  {r.type === 'REVERSED' && r.note && <span className="block text-slate-500">{r.note}</span>}
                </Td>
                <Td className={cx('whitespace-nowrap font-bold tabular-nums', r.type === 'EARNED' ? 'text-green-700' : 'text-red-700')}>{r.type === 'EARNED' ? '+' : '−'}{fmtMoney(r.amount)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Pager page={ledger.page} pageSize={ledger.pageSize} total={ledger.total} onPage={ledger.setPage} />
      <SectionTitle icon={Wallet}>Payouts</SectionTitle>
      {payouts.items.length === 0 ? (
        <Empty title="No payouts yet" />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {payouts.items.map((p) => (
            <Card key={p.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold tabular-nums">{fmtMoney(p.amount)}</p>
                <p className="truncate text-xs text-slate-500">{fmtDate(p.paidOn)} · {p.reference}{p.note ? ` · ${p.note}` : ''}</p>
              </div>
              <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-green-600" />
            </Card>
          ))}
        </div>
      )}
      <Pager page={payouts.page} pageSize={payouts.pageSize} total={payouts.total} onPage={payouts.setPage} />
    </div>
  );
}

function ProfileTab({ b, canEdit, onSaved }: { b: Blogger; canEdit: boolean; onSaved: () => void }) {
  const [f, setF] = useState({ name: b.name, phone: b.phone, city: b.city ?? '', youtubeUrl: b.youtubeUrl ?? '', instagramHandle: b.instagramHandle ?? '', blogUrl: b.blogUrl ?? '', audience: b.audience ?? '', bio: b.bio ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.patch('/blogger/me', { ...f, name: f.name.trim(), phone: f.phone.trim() });
      setMsg({ kind: 'success', text: 'Profile saved.' });
      onSaved();
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label="Name" required value={f.name} onChange={set('name')} maxLength={100} disabled={!canEdit} />
          <LabeledInput label="Contact mobile" required value={f.phone} onChange={set('phone')} disabled={!canEdit} hint="Bookings with this number don’t earn commission." />
          <LabeledInput label="YouTube channel link" value={f.youtubeUrl} onChange={set('youtubeUrl')} disabled={!canEdit} placeholder="https://youtube.com/@…" />
          <LabeledInput label="Instagram handle" value={f.instagramHandle} onChange={set('instagramHandle')} disabled={!canEdit} placeholder="@yourname" />
          <LabeledInput label="Blog / website" value={f.blogUrl} onChange={set('blogUrl')} disabled={!canEdit} placeholder="https://…" />
          <LabeledInput label="City" value={f.city} onChange={set('city')} disabled={!canEdit} />
        </div>
        <LabeledInput label="Audience" value={f.audience} onChange={set('audience')} disabled={!canEdit} maxLength={120} />
        <Field label="About you">
          <Textarea value={f.bio} onChange={set('bio')} disabled={!canEdit} maxLength={1000} rows={3} />
        </Field>
        <p className="text-xs text-slate-500">Login email: {b.email}</p>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        {canEdit && <Button type="submit" loading={busy}><Save aria-hidden className="h-4 w-4" /> Save profile</Button>}
      </form>
    </Card>
  );
}
