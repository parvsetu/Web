'use client';

import { useEffect, useState } from 'react';
import {
  BadgeIndianRupee, Building2, CalendarDays, Check, CheckCircle2, ClipboardList, Copy, Hourglass, LayoutDashboard, MessageCircle, Percent, Rocket, Share2,
  UserPlus, Wallet, XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import {
  REGISTRATION_LABEL, type AgentLedgerRow, type AgentOverview, type AgentPayoutRow, type AttributedMandal, type MandalRegistration, type RegistrationEventState,
} from '@/lib/registration-types';
import type { Paged } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { Mandala } from '@/components/FestivalArt';
import { FestivalBadge } from '@/components/FestivalBanner';
import { ApprovalBadge, PayLinkActions, paymentLine } from '@/components/registration/FeeStatus';
import { MandalRegistrationForm } from '@/components/registration/MandalRegistrationForm';
import { SearchBar } from '@/components/SearchBar';
import { Alert, Badge, Card, Empty, LabeledSelect, Pager, SectionTitle, SideTabsLayout, SkeletonList, Stat, Table, Td, cx } from '@/components/ui';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'register', label: 'Register a mandal', icon: UserPlus },
  { key: 'mandals', label: 'My mandals', icon: Building2 },
  { key: 'earnings', label: 'Earnings', icon: Wallet },
];

const REG_TONE: Record<MandalRegistration['status'], string> = {
  PENDING_VERIFICATION: 'bg-slate-100 text-slate-700',
  PENDING_REVIEW: 'bg-amber-100 text-amber-800',
  CHANGES_REQUESTED: 'bg-orange-100 text-orange-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

/** Field agent dashboard: referral code & link, registering mandals, their status, earnings and payouts. */
export default function AgentPage() {
  const { me } = useAuth();
  const isAgent = !!me?.agent;
  const overview = useAsync(() => api.get<AgentOverview>('/agent/me'), [], isAgent);
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

  return (
    <AppShell title={me?.agent?.name ?? 'Field agent'} subtitle="Parvsetu field agent" wide>
      {me && !isAgent ? (
        <Alert kind="warning">This area is for Parvsetu field agents.</Alert>
      ) : overview.error ? (
        <Alert>{overview.error}</Alert>
      ) : !o ? (
        <SkeletonList />
      ) : (
        <div className="flex flex-col gap-4">
          <section className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 text-white shadow-lg">
            <Mandala className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 text-white/15" />
            <div className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Field agent</p>
                <h1 className="break-words text-2xl font-extrabold leading-tight">{o.agent.name}</h1>
                <p className="text-sm text-white/90">Referral code <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono font-bold tracking-wider">{o.agent.code}</span></p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:w-72">
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Due to you</p>
                  <p className="text-xl font-black tabular-nums">{fmtMoney(o.earnings.due)}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Live mandals</p>
                  <p className="text-xl font-black tabular-nums">{o.stats.liveMandals}</p>
                </div>
              </div>
            </div>
          </section>
          {o.agent.status === 'SUSPENDED' && <Alert kind="warning">Your agent account is suspended — you can see your history, but can’t register new mandals. Contact the Parvsetu team.</Alert>}
          <SideTabsLayout tabs={TABS} active={tab} onChange={change}>
            {tab === 'overview' ? (
              <OverviewTab o={o} onRegister={() => change('register')} />
            ) : tab === 'register' ? (
              <RegisterTab disabled={o.agent.status !== 'ACTIVE'} onDone={() => { overview.reload(); change('mandals'); }} />
            ) : tab === 'mandals' ? (
              <MandalsTab />
            ) : (
              <EarningsTab o={o} />
            )}
          </SideTabsLayout>
        </div>
      )}
    </AppShell>
  );
}

function OverviewTab({ o, onRegister }: { o: AgentOverview; onRegister: () => void }) {
  const [copied, setCopied] = useState(false);
  const share = `Register your mandal on Parvsetu with my referral code ${o.agent.code}:`;
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Share2}>Your referral link</SectionTitle>
        <p className="-mt-2 text-sm text-slate-600">Mandals that register through this link (or with code <strong>{o.agent.code}</strong>) are credited to you.</p>
        <div className="break-all rounded-xl bg-emerald-50 px-3 py-2 font-mono text-sm text-emerald-900 ring-1 ring-emerald-200">{o.agent.referralLink}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${share} ${o.agent.referralLink}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#25D366] px-3 font-semibold text-white shadow-sm">
            <MessageCircle aria-hidden className="h-5 w-5" /> Share on WhatsApp
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(o.agent.referralLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                window.prompt('Copy your link', o.agent.referralLink);
              }
            }}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 font-semibold text-slate-800"
          >
            {copied ? <Check aria-hidden className="h-5 w-5 text-green-600" /> : <Copy aria-hidden className="h-5 w-5" />} {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" onClick={onRegister} className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 font-semibold text-white shadow-sm">
            <UserPlus aria-hidden className="h-5 w-5" /> Register a mandal
          </button>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mandals registered" value={o.stats.registered} tone="blue" icon={ClipboardList} />
        <Stat label="Waiting for review" value={o.stats.pending} tone="amber" icon={Hourglass} />
        <Stat label="Approved" value={o.stats.approved} tone="green" icon={CheckCircle2} />
        <Stat label="Live festivals" value={o.stats.liveEvents} tone="purple" icon={Rocket} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
        <Stat label="Paid to you" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
        <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
      </div>
      <Card className="flex flex-col gap-2 text-sm text-slate-700">
        <p className="flex items-start gap-2"><BadgeIndianRupee aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> <span><strong>{fmtMoney(o.rates.referralFee)}</strong> per mandal — earned when it pays its first festival registration fee.</span></p>
        {Number(o.rates.commissionPercent) > 0 && (
          <p className="flex items-start gap-2"><Percent aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> <span>Plus <strong>{Number(o.rates.commissionPercent)}%</strong> of every festival fee your mandals pay.</span></p>
        )}
        <p className="text-xs text-slate-500">Refunded fees reverse what they earned. Payouts are made by the Parvsetu team.</p>
      </Card>
    </div>
  );
}

function RegisterTab({ disabled, onDone }: { disabled: boolean; onDone: () => void }) {
  const [done, setDone] = useState<MandalRegistration | null>(null);
  if (disabled) return <Alert kind="warning">Your account is suspended, so you can’t register mandals right now.</Alert>;
  return (
    <Card className="flex flex-col gap-4">
      {done && (
        <Alert kind="success">
          <strong>{done.orgName}</strong> is registered and waiting for review. {done.contactName} got an email to set their password.{' '}
          <button type="button" className="font-semibold underline" onClick={onDone}>See my mandals</button>
        </Alert>
      )}
      <p className="text-sm text-slate-600">Fill this in with the mandal during your visit. The contact person gets an email to set their password and follow the review.</p>
      <MandalRegistrationForm key={done?.id ?? 'new'} mode="agent" onSubmitted={(r) => { setDone(r.registration ?? null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
    </Card>
  );
}

function EventLine({ e }: { e: RegistrationEventState }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3">
      <div className="flex items-start gap-2">
        <FestivalBadge type={e.festivalType} className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">{e.name}</p>
          <p className="flex items-center gap-1 text-xs text-slate-500"><CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)}{e.fee ? ` · fee ${fmtMoney(e.fee)}` : ''}</p>
        </div>
        <ApprovalBadge status={e.approvalStatus} className="shrink-0" />
      </div>
      {e.payment && <p className="text-xs text-slate-600">{paymentLine(e.payment)}</p>}
      {e.approvalStatus === 'APPROVED_AWAITING_PAYMENT' && e.payment?.payUrl && (
        <PayLinkActions compact url={e.payment.payUrl} text={`Registration fee for ${e.name} on Parvsetu:`} />
      )}
    </div>
  );
}

function MandalsTab() {
  const [status, setStatus] = useState('');
  const q = usePagedList<MandalRegistration>('/agent/mandals', { status: status || undefined }, { pageSize: 10 });
  const attributed = (q.data as (Paged<MandalRegistration> & { attributed?: AttributedMandal[] }) | null)?.attributed ?? [];
  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search mandal, city or contact" total={q.total}>
        <div className="sm:w-48">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(REGISTRATION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </LabeledSelect>
        </div>
      </SearchBar>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        <Empty icon={Building2} title={q.searching || status ? 'No mandals match' : 'No mandals registered yet'}>Register one from “Register a mandal”, or share your referral link.</Empty>
      ) : (
        q.items.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-lg font-bold">{r.orgName}</p>
                <p className="text-sm text-slate-600">{[r.city, r.state].filter(Boolean).join(', ')} · {r.contactName} · {r.contactMobile}</p>
                <p className="text-xs text-slate-500">{r.source === 'AGENT' ? 'Registered by you' : 'Used your referral code'} · {fmtDateTime(r.createdAt)}</p>
              </div>
              <Badge className={REG_TONE[r.status]}>{REGISTRATION_LABEL[r.status]}</Badge>
            </div>
            {r.reviewNote && r.status !== 'APPROVED' && (
              <p className={cx('rounded-xl px-3 py-2 text-sm', r.status === 'REJECTED' ? 'bg-red-50 text-red-900' : 'bg-orange-50 text-orange-900')}>
                {r.status === 'REJECTED' ? <XCircle aria-hidden className="mr-1 inline h-4 w-4" /> : null}Note: {r.reviewNote}
              </p>
            )}
            {r.status === 'APPROVED'
              ? r.events.map((e) => <EventLine key={e.id} e={e} />)
              : <p className="text-sm text-slate-600">{r.requestedEvents.length} festival{r.requestedEvents.length === 1 ? '' : 's'} requested: {r.requestedEvents.map((e) => e.name).join(', ')}</p>}
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {attributed.length > 0 && (
        <>
          <SectionTitle icon={Building2}>Mandals credited to you by Parvsetu</SectionTitle>
          {attributed.map((o) => (
            <Card key={o.id} className="flex flex-col gap-2">
              <p className="break-words font-bold">{o.name}</p>
              <p className="text-xs text-slate-500">{[o.city, o.state].filter(Boolean).join(', ')}{o.attributedAt ? ` · since ${fmtDate(o.attributedAt.slice(0, 10))}` : ''}</p>
              {o.events.length ? o.events.map((e) => <EventLine key={e.id} e={e} />) : <p className="text-sm text-slate-500">No new festivals yet.</p>}
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

const KIND_LABEL: Record<AgentLedgerRow['kind'], string> = { REGISTRATION: 'Mandal referral', COMMISSION: 'Fee commission', PAYOUT: 'Payout' };

function EarningsTab({ o }: { o: AgentOverview }) {
  const ledger = usePagedList<AgentLedgerRow>('/agent/ledger', {}, { pageSize: 20 });
  const payouts = usePagedList<AgentPayoutRow>('/agent/payouts', {}, { pageSize: 10 });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
        <Stat label="Paid to you" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
        <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
      </div>
      {Number(o.earnings.reversed) > 0 && <p className="text-xs text-slate-500">{fmtMoney(o.earnings.reversed)} was reversed because fees were refunded.</p>}
      <SectionTitle icon={BadgeIndianRupee}>Earnings history</SectionTitle>
      {ledger.items.length === 0 ? (
        <Empty title="No earnings yet">You earn when a mandal you brought in pays its first festival fee.</Empty>
      ) : (
        <Card>
          <Table head={['When', 'What', 'Mandal / festival', 'Amount']}>
            {ledger.items.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</Td>
                <Td className="text-xs">
                  {r.type === 'REVERSED' ? `Reversed · ${KIND_LABEL[r.kind]}` : KIND_LABEL[r.kind]}
                  {r.reversed && <Badge className="ml-1 bg-slate-100 text-slate-600">reversed</Badge>}
                </Td>
                <Td className="text-xs">{[r.organization?.name, r.event?.name].filter(Boolean).join(' · ') || r.note || '—'}</Td>
                <Td className={cx('whitespace-nowrap font-bold tabular-nums', r.type === 'EARNED' ? 'text-green-700' : 'text-red-700')}>
                  {r.type === 'EARNED' ? '+' : '−'}{fmtMoney(r.amount)}
                </Td>
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
