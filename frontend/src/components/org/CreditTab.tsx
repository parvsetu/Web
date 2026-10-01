'use client';

import { useState } from 'react';
import { AlertOctagon, AlertTriangle, BadgeIndianRupee, CreditCard, History, Percent, Plus, Ticket, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { usePagedList } from '@/lib/paged';
import { can } from '@/lib/permissions';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Table, Td, cx } from '../ui';

export interface CreditStatus {
  state: 'OK' | 'LOW' | 'EXHAUSTED';
  message: string | null;
  balance: string;
  tokenPrice: string;
  commissionPercent: string;
  feePerPass: string;
  /** What promotional partners pay per pass at this mandal (never charged to the mandal). */
  partnerRatePerPass: string;
  tokensLeft: number | null;
  lowCreditThreshold: string;
  totals: { tokens: number; persons: number; fees: string; partnerFees: string; recharged: string };
}

interface CreditTx {
  id: string;
  createdAt: string;
  type: 'RECHARGE' | 'TOKEN_FEE' | 'REFUND' | 'ADJUSTMENT' | 'WELCOME';
  source: string | null;
  event: { id: string; name: string } | null;
  amount: string;
  balanceAfter: string;
  tokenCount: number;
  personCount: number;
  feePerPass: string | null;
  partnerFee: string;
  partnersPrinted: number;
  reference: string | null;
  note: string | null;
}

interface Recharge {
  id: string;
  amount: string;
  status: string;
  paymentReference: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
}

const TYPE_LABEL: Record<CreditTx['type'], string> = {
  RECHARGE: 'Recharge', TOKEN_FEE: 'Passes generated', REFUND: 'Refund', ADJUSTMENT: 'Adjustment', WELCOME: 'Welcome credit',
};
const SOURCE_LABEL: Record<string, string> = { DESK: 'Token desk', BULK: 'Bulk', ONLINE: 'Online booking', DONATION: 'With donation' };

/** Big banner shown wherever passes are generated. */
export function CreditBanner({ status, orgId }: { status: Pick<CreditStatus, 'state' | 'message' | 'tokensLeft' | 'balance'> | null | undefined; orgId?: string }) {
  if (!status || status.state === 'OK') return null;
  const exhausted = status.state === 'EXHAUSTED';
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl border-2 p-4', exhausted ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-900')} role="alert">
      {exhausted ? <AlertOctagon aria-hidden className="h-6 w-6 shrink-0" /> : <AlertTriangle aria-hidden className="h-6 w-6 shrink-0" />}
      <div className="min-w-0">
        <p className="font-bold">{status.message}</p>
        <p className="mt-1 text-sm">
          Credit left {fmtMoney(status.balance)}
          {status.tokensLeft !== null ? ` · about ${status.tokensLeft} more pass${status.tokensLeft === 1 ? '' : 'es'}` : ''}
          {orgId && (
            <>
              {' · '}
              <a href={`/org/${orgId}#credit`} className="font-semibold underline">Recharge</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** From `/events/:id/credit-status`: how many more passes this event can issue from prepaid credit. */
export interface EventAllowance {
  state: CreditStatus['state'];
  message: string | null;
  balance: string;
  feePerPass: string;
  commissionPerPass: string;
  tokensLeft: number | null;
}

/** "You can issue N more passes" — always shown to whoever issues passes, not only on low credit. */
export function IssueAllowance({ data, className }: { data: EventAllowance | null | undefined; className?: string }) {
  if (!data) return null;
  const tone = data.state === 'EXHAUSTED' ? 'border-red-200 bg-red-50 text-red-900' : data.state === 'LOW' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900';
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl border px-4 py-3', tone, className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80">
        <Ticket aria-hidden className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        {data.tokensLeft === null ? (
          <p className="font-bold">You can issue unlimited passes for this event</p>
        ) : (
          <p className="font-bold">
            You are eligible to issue <span className="text-lg tabular-nums">{data.tokensLeft.toLocaleString('en-IN')}</span> more pass{data.tokensLeft === 1 ? '' : 'es'} for this event
          </p>
        )}
        <p className="text-xs opacity-80">
          Credit {fmtMoney(data.balance)}
          {data.tokensLeft !== null && <> · {fmtMoney(data.feePerPass)} per person</>}
          {' · '}group passes use one per person
        </p>
      </div>
    </div>
  );
}

export function CreditTab() {
  const org = useOrg();
  const status = useAsync(() => api.get<CreditStatus>(`/organizations/${org.orgId}/billing`), [org.orgId]);
  const [type, setType] = useState('');
  const txs = usePagedList<CreditTx>(`/organizations/${org.orgId}/billing/transactions`, { type: type || undefined });
  const recharges = useAsync(() => api.get<{ items: Recharge[] }>(`/organizations/${org.orgId}/billing/recharges`, { pageSize: 10 }), [org.orgId]);
  const [recharging, setRecharging] = useState(false);
  const s = status.data;

  function reloadAll() {
    status.reload();
    txs.reload();
    recharges.reload();
  }

  return (
    <div className="flex flex-col gap-4">
      {status.error && <Alert>{status.error}</Alert>}
      {status.loading && !s ? (
        <SkeletonList rows={3} />
      ) : s ? (
        <>
          <CreditBanner status={s} />
          <section
            className={cx(
              'relative overflow-hidden rounded-3xl p-5 text-white shadow-lg',
              s.state === 'EXHAUSTED' ? 'bg-gradient-to-br from-rose-500 to-red-700' : s.state === 'LOW' ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-emerald-500 to-teal-700',
            )}
          >
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
                <Wallet aria-hidden className="h-9 w-9" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Pass credit balance</p>
                <p className="text-4xl font-black">{fmtMoney(s.balance)}</p>
                <p className="text-sm text-white/90">{s.tokensLeft !== null ? `Enough for about ${s.tokensLeft} more passes` : 'Passes are free of commission'}</p>
              </div>
              {can(org.perms, 'SETTINGS_UPDATE') && (
                <button type="button" onClick={() => setRecharging(true)} className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-white px-5 font-bold text-slate-900 shadow">
                  <Plus aria-hidden className="h-5 w-5" /> Recharge
                </button>
              )}
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Token price" value={fmtMoney(s.tokenPrice)} tone="blue" icon={BadgeIndianRupee} />
            <Stat label="Platform commission" value={`${Number(s.commissionPercent)}%`} tone="purple" icon={Percent} />
            <Stat label="Charge per person" value={fmtMoney(s.feePerPass)} tone="brand" icon={Ticket} />
            <Stat label="Sponsors on passes" value="Free" tone="pink" icon={CreditCard} />
            <Stat label="Passes generated" value={s.totals.tokens} tone="green" icon={Ticket} />
            <Stat label="People admitted" value={s.totals.persons} tone="slate" icon={Ticket} />
            <Stat label="Commission paid" value={fmtMoney(s.totals.fees)} tone="red" icon={Percent} />
            <Stat label="Total recharged" value={fmtMoney(s.totals.recharged)} tone="green" icon={Wallet} />
          </div>
          <p className="text-xs text-slate-500">
            Every pass — desk, bulk, online or with a donation — uses {fmtMoney(s.feePerPass)} per person admitted
            ({Number(s.commissionPercent)}% of the {fmtMoney(s.tokenPrice)} token price). Showing your own sponsors on passes is free.
            A warning shows below {fmtMoney(s.lowCreditThreshold)}; generation stops when the credit runs out.
          </p>
        </>
      ) : null}

      {(recharges.data?.items ?? []).length > 0 && (
        <>
          <SectionTitle icon={CreditCard}>Recharges</SectionTitle>
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

      <SectionTitle icon={History}>Credit history</SectionTitle>
      <div className="sm:w-60">
        <LabeledSelect label="Show" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Everything</option>
          <option value="TOKEN_FEE">Passes generated</option>
          <option value="RECHARGE">Recharges</option>
          <option value="REFUND">Refunds</option>
          <option value="ADJUSTMENT">Adjustments</option>
        </LabeledSelect>
      </div>
      {txs.loading && !txs.data ? (
        <SkeletonList />
      ) : txs.items.length === 0 ? (
        <Empty icon={History} title="No credit activity yet" />
      ) : (
        <Card>
          <Table head={['When', 'What', 'Passes', 'Amount', 'Balance']}>
            {txs.items.map((t) => (
              <tr key={t.id}>
                <Td className="whitespace-nowrap text-xs">{fmtDateTime(t.createdAt)}</Td>
                <Td>
                  <div className="font-semibold">{TYPE_LABEL[t.type]}{t.source ? ` · ${SOURCE_LABEL[t.source] ?? t.source}` : ''}</div>
                  <div className="text-xs text-slate-500">
                    {[t.event?.name, t.reference, t.note, t.partnersPrinted ? `${t.partnersPrinted} sponsor(s) printed${Number(t.partnerFee) ? ` · ${fmtMoney(t.partnerFee)}` : ' free'}` : null].filter(Boolean).join(' · ')}
                  </div>
                </Td>
                <Td>{t.tokenCount ? `${t.tokenCount} (${t.personCount} people)` : '—'}</Td>
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

      {recharging && <RechargeModal onClose={() => setRecharging(false)} onDone={() => { setRecharging(false); reloadAll(); }} feePerPass={s?.feePerPass} />}
    </div>
  );
}

function RechargeModal({ onClose, onDone, feePerPass }: { onClose: () => void; onDone: () => void; feePerPass?: string }) {
  const org = useOrg();
  const [amount, setAmount] = useState('1000');
  const [pending, setPending] = useState<Recharge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passes = feePerPass && Number(feePerPass) > 0 ? Math.floor(Number(amount || 0) / Number(feePerPass)) : null;

  async function start() {
    setError(null);
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount) || Number(amount) < 1) return setError('Enter an amount of at least ₹1.');
    setBusy(true);
    try {
      setPending(await api.post<Recharge>(`/organizations/${org.orgId}/billing/recharges`, { amount }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay(outcome: 'success' | 'fail') {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const r = await api.post<Recharge>(`/organizations/${org.orgId}/billing/recharges/${pending.id}/demo-pay`, { outcome });
      if (r.status === 'PAID') onDone();
      else setError('Payment failed. No credit was added — you can try again.');
      setPending(r.status === 'PAID' ? null : null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Recharge pass credit">
      {!pending ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {['500', '1000', '2000', '5000'].map((a) => (
              <button key={a} type="button" onClick={() => setAmount(a)} className={cx('min-h-[44px] rounded-full px-4 font-semibold', amount === a ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'bg-white ring-1 ring-orange-200')}>
                ₹{Number(a).toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <LabeledInput label="Amount (₹)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} hint={passes !== null ? `Enough for about ${passes.toLocaleString('en-IN')} passes` : undefined} />
          {error && <Alert>{error}</Alert>}
          <Button size="lg" loading={busy} onClick={() => void start()}>
            <CreditCard aria-hidden className="h-5 w-5" /> Continue to payment
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo payment — no real money is charged.</div>
          <p className="text-center text-3xl font-black">{fmtMoney(pending.amount)}</p>
          {error && <Alert>{error}</Alert>}
          <Button variant="success" size="lg" loading={busy} onClick={() => void pay('success')}>
            Pay {fmtMoney(pending.amount)} (demo)
          </Button>
          <Button variant="ghost" onClick={() => void pay('fail')} disabled={busy}>
            Simulate failed payment
          </Button>
        </div>
      )}
    </Modal>
  );
}
