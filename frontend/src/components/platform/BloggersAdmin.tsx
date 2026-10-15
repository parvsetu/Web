'use client';

import { useState } from 'react';
import { BadgeIndianRupee, BarChart3, Check, Download, ExternalLink, Inbox, Megaphone, Pause, Play, SlidersHorizontal, Undo2, Wallet, X } from 'lucide-react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import {
  BLOGGER_STATUS_LABEL, PROMOTION_STATUS_LABEL, PROMOTION_TONE, type BloggerAdminRow, type BloggerDetail, type BloggerLedgerRow, type Promotion, type ReferralReport,
} from '@/lib/referral-types';
import type { Paged } from '@/lib/types';
import { SearchBar } from '../SearchBar';
import { FestivalBadge } from '../FestivalBanner';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Table, Td, cx } from '../ui';

const VIEWS = [
  { key: 'queue', label: 'Festival requests', icon: Inbox },
  { key: 'bloggers', label: 'Bloggers', icon: Megaphone },
  { key: 'report', label: 'Report', icon: BarChart3 },
] as const;

const BLOGGER_TONE: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-800', ACTIVE: 'bg-green-100 text-green-800', REJECTED: 'bg-red-100 text-red-800', SUSPENDED: 'bg-slate-200 text-slate-700' };

/** Super admin: blogger / influencer accounts, their festival promotions (each approved separately), commission, payouts and the referral report. */
export function BloggersAdmin() {
  const [view, setView] = useState<(typeof VIEWS)[number]['key']>('queue');
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Bloggers sign up at <span className="font-mono">/blogger/signup</span> and pick festivals to promote. Approve the blogger, then each festival — that gives them a referral code and link. Commission (platform-paid) is credited once a referred booking is paid and reversed if all its passes are cancelled.
      </p>
      <div className="flex flex-wrap gap-2" role="tablist">
        {VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
            className={cx('inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold ring-1', view === v.key ? 'bg-pink-600 text-white ring-pink-600' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50')}>
            <v.icon aria-hidden className="h-4 w-4" /> {v.label}
          </button>
        ))}
      </div>
      {view === 'queue' ? <Queue /> : view === 'bloggers' ? <BloggerList /> : <Report />}
    </div>
  );
}

function Queue() {
  const [status, setStatus] = useState('PENDING');
  const q = usePagedList<Promotion>('/platform/blogger-promotions', { status: status || undefined }, { pageSize: 20 });
  const [reviewing, setReviewing] = useState<Promotion | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search blogger, festival or code" total={q.total}>
        <div className="sm:w-48">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(PROMOTION_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </LabeledSelect>
        </div>
      </SearchBar>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : q.items.length === 0 ? (
        <Empty icon={Inbox} title={status === 'PENDING' ? 'No festival requests waiting' : 'Nothing matches'} />
      ) : (
        q.items.map((p) => (
          <Card key={p.id} className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              <FestivalBadge type={p.event.festivalType} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-bold">{p.event.name} <span className="font-normal text-slate-500">· {p.event.organization.name}</span></p>
                <p className="text-sm text-slate-700">
                  {p.blogger?.name} <Badge className={BLOGGER_TONE[p.blogger?.status ?? 'PENDING']}>{BLOGGER_STATUS_LABEL[p.blogger?.status ?? 'PENDING']}</Badge>
                </p>
                <Channels b={p.blogger} />
              </div>
              <Badge className={PROMOTION_TONE[p.status]}>{PROMOTION_STATUS_LABEL[p.status]}</Badge>
            </div>
            <p className="text-xs text-slate-500">{fmtDate(p.event.startDate)} – {fmtDate(p.event.endDate)} · requested {fmtDateTime(p.createdAt)}{p.code ? ` · code ${p.code}` : ''} · {p.commission.label}{p.commission.custom ? ' (custom)' : ''}</p>
            <Button size="sm" variant="secondary" onClick={() => setReviewing(p)}><SlidersHorizontal aria-hidden className="h-4 w-4" /> Review</Button>
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {reviewing && <ReviewPromotion p={reviewing} bloggerActive={reviewing.blogger?.status === 'ACTIVE'} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); q.reload(); }} />}
    </div>
  );
}

function Channels({ b }: { b?: { instagramHandle: string | null; youtubeUrl: string | null; blogUrl: string | null } | null }) {
  if (!b) return null;
  const links = [
    b.instagramHandle && { label: `Instagram ${b.instagramHandle}`, href: `https://instagram.com/${b.instagramHandle.replace(/^@/, '')}` },
    b.youtubeUrl && { label: 'YouTube', href: b.youtubeUrl },
    b.blogUrl && { label: 'Blog', href: b.blogUrl },
  ].filter(Boolean) as { label: string; href: string }[];
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-pink-700 underline">
          {l.label} <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      ))}
    </p>
  );
}

/** Approve (with optional custom code / commission), reject, or switch off a promotion. */
function ReviewPromotion({ p, bloggerActive, onClose, onDone }: { p: Promotion; bloggerActive: boolean; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'DEFAULT' | 'PERCENT' | 'FIXED'>(p.commission.custom ? p.commission.mode : 'DEFAULT');
  const [value, setValue] = useState(p.commission.custom ? (p.commission.percent ?? p.commission.amount ?? '') : '');
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commission = mode === 'DEFAULT' ? { commissionMode: 'DEFAULT' } : { commissionMode: mode, commissionValue: value };
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const review = (decision: 'APPROVE' | 'REJECT' | 'REVOKE') => run(() => api.post(`/platform/blogger-promotions/${p.id}/review`, {
    decision, ...(note.trim() ? { note: note.trim() } : {}), ...(decision === 'APPROVE' ? commission : {}), ...(decision === 'APPROVE' && code.trim() ? { code: code.trim() } : {}),
  }));
  return (
    <Modal open onClose={onClose} title={`${p.event.name}${p.blogger ? ` — ${p.blogger.name}` : ''}`}>
      <div className="flex flex-col gap-3">
        {!bloggerActive && p.status !== 'APPROVED' && <Alert kind="warning">Approve the blogger account first (Bloggers tab) — a pending blogger’s festivals can’t be approved.</Alert>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledSelect label="Commission" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="DEFAULT">Platform default</option>
            <option value="PERCENT">% of ticket value</option>
            <option value="FIXED">Fixed ₹ per booking</option>
          </LabeledSelect>
          {mode !== 'DEFAULT' && <LabeledInput label={mode === 'PERCENT' ? 'Percent' : 'Amount (₹)'} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />}
        </div>
        {p.status !== 'APPROVED' && !p.code && (
          <LabeledInput label="Referral code (optional)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} hint="4–20 letters/digits; generated from the name and festival if empty" />
        )}
        <LabeledInput label="Note to the blogger (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <Alert>{error}</Alert>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {p.status === 'APPROVED' ? (
            <>
              <Button variant="secondary" loading={busy} onClick={() => void run(() => api.patch(`/platform/blogger-promotions/${p.id}/commission`, commission))}><BadgeIndianRupee aria-hidden className="h-4 w-4" /> Save commission</Button>
              <Button variant="danger" loading={busy} onClick={() => void review('REVOKE')}><Pause aria-hidden className="h-4 w-4" /> Switch off link</Button>
            </>
          ) : (
            <>
              <Button variant="success" loading={busy} disabled={!bloggerActive} onClick={() => void review('APPROVE')}><Check aria-hidden className="h-4 w-4" /> Approve</Button>
              {p.status === 'PENDING' && <Button variant="danger" loading={busy} onClick={() => void review('REJECT')}><X aria-hidden className="h-4 w-4" /> Reject</Button>}
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">Commission changes apply to bookings paid from now on.</p>
      </div>
    </Modal>
  );
}

function BloggerList() {
  const [status, setStatus] = useState('');
  const q = usePagedList<BloggerAdminRow>('/platform/bloggers', { status: status || undefined }, { pageSize: 20 });
  const [managing, setManaging] = useState<BloggerAdminRow | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search name, email, Instagram, city or code" total={q.total}>
        <div className="sm:w-44">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(BLOGGER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </LabeledSelect>
        </div>
      </SearchBar>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : q.items.length === 0 ? (
        <Empty icon={Megaphone} title={q.searching || status ? 'No bloggers match' : 'No bloggers yet'}>Bloggers appear here when they sign up at /blogger/signup.</Empty>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {q.items.map((b) => (
            <Card key={b.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 break-words font-bold">{b.name}</span>
                <Badge className={BLOGGER_TONE[b.status]}>{BLOGGER_STATUS_LABEL[b.status]}</Badge>
              </div>
              <p className="truncate text-xs text-slate-500">{b.email} · {b.phone}{b.city ? ` · ${b.city}` : ''}{b.audience ? ` · ${b.audience}` : ''}</p>
              <Channels b={b} />
              <p className="text-xs text-slate-600">{b.promotions.approved} live · {b.promotions.pending} waiting · earned {fmtMoney(b.earnings.earned)} · due {fmtMoney(b.earnings.due)}</p>
              <Button size="sm" variant="secondary" onClick={() => setManaging(b)}><SlidersHorizontal aria-hidden className="h-4 w-4" /> Manage</Button>
            </Card>
          ))}
        </div>
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {managing && <ManageBlogger id={managing.id} name={managing.name} onClose={() => setManaging(null)} onChanged={() => q.reload()} />}
    </div>
  );
}

function ManageBlogger({ id, name, onClose, onChanged }: { id: string; name: string; onClose: () => void; onChanged: () => void }) {
  const d = useAsync(() => api.get<BloggerDetail>(`/platform/bloggers/${id}`), [id]);
  const ledger = useAsync(() => api.get<Paged<BloggerLedgerRow>>(`/platform/bloggers/${id}/ledger`, { pageSize: 15 }), [id]);
  const [pay, setPay] = useState({ amount: '', paidOn: todayIn(), reference: '', note: '' });
  const [reviewing, setReviewing] = useState<Promotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const o = d.data;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      d.reload();
      ledger.reload();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const setStatus = (status: 'ACTIVE' | 'REJECTED' | 'SUSPENDED', msg: string, ask?: string) => {
    const note = ask ? window.prompt(ask, '') : '';
    if (note === null) return;
    void run(() => api.patch(`/platform/bloggers/${id}/status`, { status, ...(note ? { note } : {}) }), msg);
  };
  const status = o?.blogger.status;

  return (
    <Modal open onClose={onClose} title={name} wide>
      <div className="flex flex-col gap-4">
        {!o ? <SkeletonList rows={2} /> : (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <p><Badge className={BLOGGER_TONE[o.blogger.status]}>{BLOGGER_STATUS_LABEL[o.blogger.status]}</Badge> <span className="text-slate-500">· joined {fmtDate(o.blogger.createdAt.slice(0, 10))}</span></p>
              <p className="text-slate-600">{o.blogger.email} · {o.blogger.phone}{o.blogger.city ? ` · ${o.blogger.city}` : ''}</p>
              <Channels b={o.blogger} />
              {o.blogger.audience && <p className="text-slate-600">Audience: {o.blogger.audience}</p>}
              {o.blogger.bio && <p className="whitespace-pre-line rounded-xl bg-slate-50 px-3 py-2 text-slate-700">{o.blogger.bio}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {status === 'PENDING' && (
                <>
                  <Button variant="success" loading={busy} onClick={() => setStatus('ACTIVE', 'Blogger approved. Now approve their festivals.')}><Check aria-hidden className="h-4 w-4" /> Approve blogger</Button>
                  <Button variant="danger" loading={busy} onClick={() => setStatus('REJECTED', 'Application rejected.', 'Reject this blogger? Optional note (emailed to them):')}><X aria-hidden className="h-4 w-4" /> Reject</Button>
                </>
              )}
              {status === 'ACTIVE' && <Button variant="danger" loading={busy} onClick={() => setStatus('SUSPENDED', 'Suspended — links stop earning.', 'Suspend this blogger? Optional note:')}><Pause aria-hidden className="h-4 w-4" /> Suspend</Button>}
              {(status === 'SUSPENDED' || status === 'REJECTED') && <Button variant="success" loading={busy} onClick={() => setStatus('ACTIVE', 'Blogger re-activated.')}><Play aria-hidden className="h-4 w-4" /> {status === 'REJECTED' ? 'Approve after all' : 'Re-activate'}</Button>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
              <Stat label="Paid" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
              <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
            </div>
          </>
        )}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}

        <SectionTitle icon={Megaphone}>Festivals</SectionTitle>
        {o && (o.promotions.length === 0 ? <p className="text-sm text-slate-500">No festivals requested.</p> : (
          <div className="flex flex-col gap-2">
            {o.promotions.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold">{p.event.name}</span>
                  <Badge className={PROMOTION_TONE[p.status]}>{PROMOTION_STATUS_LABEL[p.status]}</Badge>
                </div>
                <p className="text-xs text-slate-500">{p.event.organization.name}{p.code ? ` · ${p.code}` : ''} · {p.commission.label}{p.commission.custom ? ' (custom)' : ''} · {p.stats.paidBookings} paid bookings · {fmtMoney(p.stats.commissionNet)}</p>
                <Button size="sm" variant="secondary" onClick={() => setReviewing(p)}>Review</Button>
              </div>
            ))}
          </div>
        ))}

        <SectionTitle icon={Wallet}>Record a payout</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label={`Amount (₹)${o ? ` — up to ${fmtMoney(o.earnings.due)}` : ''}`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
          <LabeledInput label="Paid on" type="date" value={pay.paidOn} onChange={(e) => setPay((p) => ({ ...p, paidOn: e.target.value }))} />
          <LabeledInput label="Reference (UTR / UPI)" value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} maxLength={200} />
          <LabeledInput label="Note (optional)" value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} maxLength={500} />
        </div>
        <Button loading={busy} disabled={!pay.amount || pay.reference.trim().length < 2} onClick={() => void run(async () => {
          await api.post(`/platform/bloggers/${id}/payouts`, { amount: pay.amount, paidOn: pay.paidOn, reference: pay.reference.trim(), note: pay.note.trim() || undefined });
          setPay((p) => ({ ...p, amount: '', reference: '', note: '' }));
        }, 'Payout recorded.')}>
          <Wallet aria-hidden className="h-4 w-4" /> Record payout
        </Button>

        <SectionTitle icon={BadgeIndianRupee}>Recent ledger</SectionTitle>
        {(ledger.data?.items ?? []).length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
            {ledger.data!.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.type === 'PAID' ? 'Payout' : r.type === 'REVERSED' ? 'Reversed' : 'Commission'}</span>
                  <span className="block truncate text-xs text-slate-500">{[r.event?.name, r.booking?.invoiceNo, r.note].filter(Boolean).join(' · ')} · {fmtDateTime(r.createdAt)}</span>
                </span>
                <span className={cx('font-bold tabular-nums', r.type === 'EARNED' ? 'text-green-700' : 'text-red-700')}>{r.type === 'EARNED' ? '+' : '−'}{fmtMoney(r.amount)}</span>
                {r.type === 'EARNED' && !r.reversed && (
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => {
                    const reason = window.prompt('Reverse this commission (e.g. the booking was refunded outside Parvsetu)? Reason:', '');
                    if (reason && reason.trim().length >= 5) void run(() => api.post(`/platform/referral-ledger/${r.id}/reverse`, { reason: reason.trim() }), 'Commission reversed.');
                  }}>
                    <Undo2 aria-hidden className="h-4 w-4" /> Reverse
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {reviewing && <ReviewPromotion p={reviewing} bloggerActive={status === 'ACTIVE'} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); d.reload(); onChanged(); }} />}
    </Modal>
  );
}

function Report() {
  const [range, setRange] = useState({ from: '', to: '' });
  const query = { from: range.from || undefined, to: range.to || undefined };
  const r = useAsync(() => api.get<ReferralReport>('/platform/referrals/report', query), [range.from, range.to]);
  const [error, setError] = useState<string | null>(null);
  const t = r.data?.totals;
  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
        <LabeledInput label="From" type="date" value={range.from} onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))} />
        <LabeledInput label="To" type="date" value={range.to} onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))} />
        <Button variant="secondary" onClick={() => void downloadFile('/platform/referrals/report', { ...query, format: 'csv' }, 'blogger-referrals.csv').catch((e) => setError(errorMessage(e)))}>
          <Download aria-hidden className="h-4 w-4" /> Download CSV
        </Button>
      </Card>
      {(error || r.error) && <Alert>{error ?? r.error}</Alert>}
      {t && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Referred bookings" value={t.referrals} tone="blue" />
          <Stat label="Paid bookings" value={`${t.paidBookings} · ${t.visitors} people`} tone="green" />
          <Stat label="Payments" value={fmtMoney(t.gross)} tone="purple" />
          <Stat label="Commission (net)" value={`${fmtMoney(t.commissionNet)} · paid ${fmtMoney(t.paidOut)}`} tone="brand" />
        </div>
      )}
      {!r.data ? <SkeletonList /> : r.data.items.length === 0 ? <Empty icon={BarChart3} title="No referral links yet" /> : (
        <Card>
          <Table head={['Blogger', 'Festival', 'Code', 'Referred', 'Paid', 'People', 'Payments', 'Commission', 'Reversed']}>
            {r.data.items.map((i) => (
              <tr key={i.promotionId}>
                <Td className="text-sm font-semibold">{i.blogger}</Td>
                <Td className="text-xs">{i.festival}<span className="block text-slate-500">{i.mandal}</span></Td>
                <Td className="font-mono text-xs">{i.code}{i.status !== 'APPROVED' && <span className="block font-sans text-slate-500">{PROMOTION_STATUS_LABEL[i.status]}</span>}</Td>
                <Td className="tabular-nums">{i.referrals}</Td>
                <Td className="tabular-nums">{i.paidBookings}</Td>
                <Td className="tabular-nums">{i.visitors}</Td>
                <Td className="whitespace-nowrap tabular-nums">{fmtMoney(i.gross)}</Td>
                <Td className="whitespace-nowrap font-bold tabular-nums text-green-700">{fmtMoney(i.commissionNet)}</Td>
                <Td className="whitespace-nowrap tabular-nums text-red-700">{Number(i.commissionReversed) > 0 ? fmtMoney(i.commissionReversed) : '—'}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <p className="text-xs text-slate-500">Dates filter by booking time / payment time / commission time (IST). Commission is paid by the platform, not deducted from mandal settlements.</p>
    </div>
  );
}
