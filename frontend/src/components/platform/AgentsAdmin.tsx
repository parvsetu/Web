'use client';

import { useState } from 'react';
import { BadgeIndianRupee, BriefcaseBusiness, Building2, Check, Copy, KeyRound, Pause, Play, Plus, Save, SlidersHorizontal, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import { REGISTRATION_LABEL, type AgentInfo, type AgentLedgerRow, type AgentOverview, type AgentPayoutRow, type AttributedMandal, type MandalRegistration } from '@/lib/registration-types';
import type { Paged } from '@/lib/types';
import { SearchBar } from '../SearchBar';
import { ApprovalBadge } from '../registration/FeeStatus';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, cx } from '../ui';

type AgentRow = AgentInfo & Pick<AgentOverview, 'rates' | 'stats' | 'earnings'>;

/** Super admin: field agents — create, suspend, per-agent rates, payouts, their mandals. */
export function AgentsAdmin() {
  const [status, setStatus] = useState('');
  const q = usePagedList<AgentRow>('/platform/agents', { status: status || undefined }, { pageSize: 20 });
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<AgentRow | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}><Plus aria-hidden className="h-4 w-4" /> New agent</Button>
      </div>
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search name, code, phone or email" total={q.total}>
        <div className="sm:w-44">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </LabeledSelect>
        </div>
      </SearchBar>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        <Empty icon={BriefcaseBusiness} title={q.searching ? 'No agents match' : 'No field agents yet'} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {q.items.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-sm">
                  <BriefcaseBusiness aria-hidden className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-bold">{a.name}</span>
                    <Badge value={a.status} />
                  </div>
                  <p className="text-sm text-slate-600"><span className="font-mono font-semibold text-emerald-800">{a.code}</span> · {a.phone}</p>
                  <p className="truncate text-xs text-slate-500">{a.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Mandals added" value={String(a.stats.registered + Math.max(0, a.stats.mandals - a.stats.approved))} />
                <Mini label="Live mandals" value={String(a.stats.liveMandals)} />
                <Mini label="Pending" value={String(a.stats.pending)} />
                <Mini label="Earned" value={fmtMoney(a.earnings.earned)} />
                <Mini label="Paid" value={fmtMoney(a.earnings.paid)} />
                <Mini label="Due" value={fmtMoney(a.earnings.due)} strong />
              </div>
              <p className="text-xs text-slate-500">
                {fmtMoney(a.rates.referralFee)} per mandal{a.rates.referralFeeCustom ? ' (custom)' : ''} · {Number(a.rates.commissionPercent)}% of fees{a.rates.commissionCustom ? ' (custom)' : ''}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setManaging(a)}><SlidersHorizontal aria-hidden className="h-4 w-4" /> Manage</Button>
            </Card>
          ))}
        </div>
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {creating && <CreateAgent onClose={() => setCreating(false)} onDone={() => q.reload()} />}
      {managing && <ManageAgent a={managing} onClose={() => setManaging(null)} onChanged={() => q.reload()} />}
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('min-w-0 rounded-xl px-1.5 py-2', strong ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-slate-50')}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cx('break-words text-sm font-bold tabular-nums', strong ? 'text-emerald-800' : 'text-slate-800')}>{value}</p>
    </div>
  );
}

function CreateAgent({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', code: '', referralFee: '', commissionPercent: '' });
  const [created, setCreated] = useState<{ agent: AgentInfo; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2 || form.phone.replace(/\D/g, '').length < 10 || !/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a name, a 10-digit mobile and an email.');
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ agent: AgentInfo; temporaryPassword: string }>('/platform/agents', {
        name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(),
        ...(form.code.trim() ? { code: form.code.trim() } : {}),
        ...(form.referralFee.trim() ? { referralFee: form.referralFee.trim() } : {}),
        ...(form.commissionPercent.trim() ? { commissionPercent: form.commissionPercent.trim() } : {}),
      });
      setCreated(r);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="New field agent">
      {created ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success"><strong>{created.agent.name}</strong> can log in now. The temporary password was also emailed to {created.agent.email}.</Alert>
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-xs uppercase tracking-wide text-slate-400">Login</p>
            <p className="font-semibold">{created.agent.phone} / {created.agent.email}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">Temporary password (shown once)</p>
            <p className="break-all font-mono text-lg font-bold">{created.temporaryPassword}</p>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">Referral code</p>
            <p className="font-mono font-bold text-emerald-300">{created.agent.code}</p>
          </div>
          <Button variant="secondary" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`Parvsetu agent login: ${created.agent.phone}\nPassword: ${created.temporaryPassword}\nReferral code: ${created.agent.code}`);
              setCopied(true);
            } catch {
              /* ignore */
            }
          }}>
            {copied ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />} {copied ? 'Copied' : 'Copy login details'}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <LabeledInput label="Name" value={form.name} onChange={set('name')} maxLength={100} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Mobile" inputMode="numeric" value={form.phone} onChange={set('phone')} />
            <LabeledInput label="Email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <LabeledInput label="Referral code (optional)" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} maxLength={12} hint="4–12 letters/digits; generated from the name if empty" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Referral per mandal (₹, optional)" inputMode="decimal" value={form.referralFee} onChange={(e) => setForm((f) => ({ ...f, referralFee: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="platform default" />
            <LabeledInput label="% of each event fee (optional)" inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="platform default" />
          </div>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}><KeyRound aria-hidden className="h-4 w-4" /> Create agent &amp; login</Button>
        </form>
      )}
    </Modal>
  );
}

interface AgentDetail extends AgentOverview {
  mandals: Paged<MandalRegistration> & { attributed: AttributedMandal[] };
}

function ManageAgent({ a, onClose, onChanged }: { a: AgentRow; onClose: () => void; onChanged: () => void }) {
  const d = useAsync(() => api.get<AgentDetail>(`/platform/agents/${a.id}`), [a.id]);
  const ledger = useAsync(() => api.get<Paged<AgentLedgerRow>>(`/platform/agents/${a.id}/ledger`, { pageSize: 10 }), [a.id]);
  const payouts = useAsync(() => api.get<Paged<AgentPayoutRow>>(`/platform/agents/${a.id}/payouts`, { pageSize: 10 }), [a.id]);
  const [referral, setReferral] = useState(a.rates.referralFeeCustom ? a.rates.referralFee : '');
  const [pct, setPct] = useState(a.rates.commissionCustom ? a.rates.commissionPercent : '');
  const [pay, setPay] = useState({ amount: '', paidOn: todayIn(), reference: '', note: '' });
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
      payouts.reload();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const status = o?.agent.status ?? a.status;

  return (
    <Modal open onClose={onClose} title={a.name} wide>
      <div className="flex flex-col gap-4">
        {o ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="Earned" value={fmtMoney(o.earnings.earned)} tone="green" icon={BadgeIndianRupee} />
            <Stat label="Paid" value={fmtMoney(o.earnings.paid)} tone="slate" icon={Wallet} />
            <Stat label="Due" value={fmtMoney(o.earnings.due)} tone="brand" icon={Wallet} />
          </div>
        ) : <SkeletonList rows={1} />}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}

        <SectionTitle icon={Wallet}>Record a payout</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label={`Amount (₹)${o ? ` — up to ${fmtMoney(o.earnings.due)}` : ''}`} inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
          <LabeledInput label="Paid on" type="date" value={pay.paidOn} onChange={(e) => setPay((p) => ({ ...p, paidOn: e.target.value }))} />
          <LabeledInput label="Reference (UTR / UPI)" value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} maxLength={200} />
          <LabeledInput label="Note (optional)" value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} maxLength={500} />
        </div>
        <Button loading={busy} disabled={!pay.amount || pay.reference.trim().length < 2} onClick={() => void run(async () => {
          await api.post(`/platform/agents/${a.id}/payouts`, { amount: pay.amount, paidOn: pay.paidOn, reference: pay.reference.trim(), note: pay.note.trim() || undefined });
          setPay((p) => ({ ...p, amount: '', reference: '', note: '' }));
        }, 'Payout recorded.')}>
          <Wallet aria-hidden className="h-4 w-4" /> Record payout
        </Button>

        <SectionTitle icon={SlidersHorizontal}>Rates &amp; status</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label="Referral per mandal (₹)" inputMode="decimal" value={referral} onChange={(e) => setReferral(e.target.value.replace(/[^\d.]/g, ''))} placeholder="platform default" />
          <LabeledInput label="% of each event fee" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))} placeholder="platform default" />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="secondary" loading={busy} onClick={() => void run(() => api.patch(`/platform/agents/${a.id}`, { referralFee: referral.trim() || null, commissionPercent: pct.trim() || null }), 'Rates saved. New earnings use them.')}>
            <Save aria-hidden className="h-4 w-4" /> Save rates
          </Button>
          {status === 'ACTIVE' ? (
            <Button variant="danger" loading={busy} onClick={() => { const reason = window.prompt('Suspend this agent? Optional reason:', ''); if (reason !== null) void run(() => api.patch(`/platform/agents/${a.id}`, { status: 'SUSPENDED', reason: reason || undefined }), 'Agent suspended — read-only, no new earnings or registrations.'); }}>
              <Pause aria-hidden className="h-4 w-4" /> Suspend
            </Button>
          ) : (
            <Button variant="success" loading={busy} onClick={() => void run(() => api.patch(`/platform/agents/${a.id}`, { status: 'ACTIVE' }), 'Agent re-activated.')}>
              <Play aria-hidden className="h-4 w-4" /> Re-activate
            </Button>
          )}
        </div>

        <SectionTitle icon={Building2}>Mandals</SectionTitle>
        {!o ? <SkeletonList rows={2} /> : o.mandals.items.length === 0 && o.mandals.attributed.length === 0 ? (
          <Empty title="No mandals yet" />
        ) : (
          <div className="flex flex-col gap-2">
            {o.mandals.items.map((r) => (
              <div key={r.id} className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-semibold">{r.orgName}</span>
                  <Badge value={r.status === 'APPROVED' ? 'APPROVED' : r.status === 'REJECTED' ? 'REJECTED' : 'PENDING'}>{REGISTRATION_LABEL[r.status]}</Badge>
                </div>
                <p className="text-xs text-slate-500">{[r.city, r.state].filter(Boolean).join(', ')} · {r.source === 'AGENT' ? 'filed by agent' : 'referral code'} · {fmtDate(r.createdAt.slice(0, 10))}</p>
                {r.events.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 break-words">{e.name}</span>
                    <ApprovalBadge status={e.approvalStatus} />
                  </div>
                ))}
              </div>
            ))}
            {o.mandals.attributed.map((m) => (
              <div key={m.id} className="rounded-xl bg-emerald-50 p-3 text-sm">
                <span className="font-semibold">{m.name}</span> <span className="text-xs text-emerald-800">· credited by super admin</span>
              </div>
            ))}
          </div>
        )}

        <SectionTitle icon={BadgeIndianRupee}>Recent ledger</SectionTitle>
        {(ledger.data?.items ?? []).length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : (
          <ul className="flex flex-col divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
            {ledger.data!.items.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{r.type === 'PAID' ? 'Payout' : r.type === 'REVERSED' ? `Reversed ${r.kind.toLowerCase()}` : r.kind === 'REGISTRATION' ? 'Referral' : 'Commission'}</span>
                  <span className="block truncate text-xs text-slate-500">{[r.organization?.name, r.event?.name, r.note].filter(Boolean).join(' · ')} · {fmtDateTime(r.createdAt)}</span>
                </span>
                <span className={cx('font-bold tabular-nums', r.type === 'EARNED' ? 'text-green-700' : 'text-red-700')}>{r.type === 'EARNED' ? '+' : '−'}{fmtMoney(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {(payouts.data?.items ?? []).length > 0 && (
          <p className="text-xs text-slate-500">Last payout: {fmtMoney(payouts.data!.items[0].amount)} on {fmtDate(payouts.data!.items[0].paidOn)} ({payouts.data!.items[0].reference})</p>
        )}
      </div>
    </Modal>
  );
}
