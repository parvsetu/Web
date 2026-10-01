'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, BadgeCheck, Building, Check, Copy, Eye, FileSearch, Landmark, Send, ShieldAlert, Undo2, Users, XCircle } from 'lucide-react';
import { api, errorMessage, fetchBlob } from '@/lib/api';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import type { IdName, Paged, PayoutStatus, PlatformPayoutAccount, RevealedBank, Settlement, SettlementPage } from '@/lib/types';
import { PayoutStatusBadge, PayoutsList, REGISTERED_TYPE_LABEL, SettlementsList, SettlementTotalsGrid, usePayouts, useSettlements } from '../payouts/PayoutParts';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Textarea, cx } from '../ui';

type Decision = 'VERIFIED' | 'NEEDS_CORRECTION' | 'REJECTED';

/** Super admin: payout-account KYC review, the settlement ledger and manual payouts. */
export function PayoutsAdmin() {
  const [payFor, setPayFor] = useState<IdName | null>(null);
  const [tick, setTick] = useState(0);
  return (
    <div className="flex flex-col gap-4">
      <ReviewQueue onPayOut={setPayFor} key={`q${tick}`} />
      <SettlementsSection onPayOut={setPayFor} key={`s${tick}`} />
      {payFor && (
        <PayoutModal
          org={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            setTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}

// ─── KYC review queue ───────────────────────────────────────────────

function ReviewQueue({ onPayOut }: { onPayOut: (o: IdName) => void }) {
  const [status, setStatus] = useState<PayoutStatus | ''>('PENDING');
  const q = usePagedList<PlatformPayoutAccount>('/platform/payout-accounts', { status: status || undefined }, { pageSize: 10 });
  const [reviewing, setReviewing] = useState<{ a: PlatformPayoutAccount; decision: Decision } | null>(null);
  return (
    <>
      <SectionTitle icon={FileSearch}>Payout accounts (KYC)</SectionTitle>
      <div className="sm:w-60">
        <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value as PayoutStatus | '')}>
          <option value="PENDING">Waiting for review</option>
          <option value="NEEDS_CORRECTION">Needs correction</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </LabeledSelect>
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={2} />
      ) : q.items.length === 0 ? (
        <Empty icon={BadgeCheck} title={status === 'PENDING' ? 'Nothing waiting for review' : 'No accounts here'} />
      ) : (
        <div className="flex flex-col gap-3">
          {q.items.map((a) => (
            <AccountCard key={a.organizationId} a={a} onReview={(decision) => setReviewing({ a, decision })} onPayOut={() => onPayOut({ id: a.organizationId, name: a.organization.name })} />
          ))}
        </div>
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {reviewing && (
        <ReviewModal
          a={reviewing.a}
          decision={reviewing.decision}
          onClose={() => setReviewing(null)}
          onDone={() => {
            setReviewing(null);
            q.reload();
          }}
        />
      )}
    </>
  );
}

function Kv({ k, v, mono }: { k: string; v: string | null | undefined; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
      <dd className={cx('break-words text-sm font-semibold text-slate-900', mono && 'font-mono')}>{v || '—'}</dd>
    </div>
  );
}

function AccountCard({ a, onReview, onPayOut }: { a: PlatformPayoutAccount; onReview: (d: Decision) => void; onPayOut: () => void }) {
  const reg = a.entityType === 'REGISTERED';
  const [proofErr, setProofErr] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function viewProof() {
    setProofErr(null);
    // Open the tab synchronously so pop-up blockers allow it, then fill it.
    const win = window.open('', '_blank');
    setOpening(true);
    try {
      const blob = await fetchBlob(`/platform/payout-accounts/${a.organizationId}/proof`);
      const url = URL.createObjectURL(blob);
      if (win) win.location.href = url;
      else window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      win?.close();
      setProofErr(errorMessage(e));
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', reg ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-600')}>
            {reg ? <Building aria-hidden className="h-5 w-5" /> : <Users aria-hidden className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{a.organization.name}</span>
              <PayoutStatusBadge status={a.status} />
              <Badge className={reg ? 'bg-sky-100 text-sky-800' : 'bg-orange-100 text-orange-800'}>
                {reg ? REGISTERED_TYPE_LABEL[a.registeredType ?? 'OTHER'] : 'Unregistered'}
              </Badge>
            </div>
            <div className="text-sm text-slate-600">
              {a.legalName} · {[a.organization.city, a.organization.state].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>
        <span className="text-xs text-slate-500">Submitted {fmtDateTime(a.submittedAt)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-orange-50/40 p-3 ring-1 ring-orange-100 sm:grid-cols-4">
        {reg && <Kv k="Registration no." v={a.registrationNumber} />}
        {reg && <Kv k="Org PAN" v={a.orgPan} mono />}
        {reg && a.gstin && <Kv k="GSTIN" v={a.gstin} mono />}
        {reg && (a.reg80G || a.reg12A) && <Kv k="80G / 12A" v={[a.reg80G, a.reg12A].filter(Boolean).join(' / ')} />}
        <Kv k="Signatory PAN" v={a.signatoryPan} mono />
        <Kv k="Account holder" v={a.bankHolderName} />
        <Kv k="Account" v={`${a.bankAccount} · ${a.accountType === 'CURRENT' ? 'Current' : 'Savings'}`} mono />
        <Kv k="IFSC" v={a.ifsc} mono />
        <Kv k="Contact" v={`${a.contactName} (${a.contactRole})`} />
        <Kv k="Phone / email" v={`${a.contactPhone} · ${a.contactEmail}`} />
        <div className="col-span-2">
          <Kv k="Address" v={`${a.addressLine}, ${a.city}, ${a.state} ${a.pincode}`} />
        </div>
      </dl>
      {a.reviewNote && <p className="text-sm text-slate-600">Last note: <span className="font-semibold">{a.reviewNote}</span>{a.gatewayAccountId ? ` · gateway ${a.gatewayAccountId}` : ''}</p>}
      {!a.reviewNote && a.gatewayAccountId && <p className="text-sm text-slate-600">Gateway account <span className="font-mono">{a.gatewayAccountId}</span></p>}
      {proofErr && <Alert>{proofErr}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!a.hasProof} loading={opening} onClick={() => void viewProof()}>
          <Eye aria-hidden className="h-4 w-4" /> {a.hasProof ? 'View proof' : 'No proof uploaded'}
        </Button>
        <span className="flex-1" />
        {a.status !== 'VERIFIED' && (
          <Button variant="success" size="sm" onClick={() => onReview('VERIFIED')}>
            <BadgeCheck aria-hidden className="h-4 w-4" /> Verify
          </Button>
        )}
        {a.status === 'VERIFIED' && (
          <Button size="sm" onClick={onPayOut}>
            <Send aria-hidden className="h-4 w-4" /> Pay out
          </Button>
        )}
        {a.status !== 'NEEDS_CORRECTION' && (
          <Button variant="secondary" size="sm" onClick={() => onReview('NEEDS_CORRECTION')}>
            <Undo2 aria-hidden className="h-4 w-4" /> Needs correction
          </Button>
        )}
        {a.status !== 'REJECTED' && (
          <Button variant="ghost" size="sm" className="text-red-700" onClick={() => onReview('REJECTED')}>
            <XCircle aria-hidden className="h-4 w-4" /> Reject
          </Button>
        )}
      </div>
    </Card>
  );
}

const DECISION_TEXT: Record<Decision, { title: string; button: string }> = {
  VERIFIED: { title: 'Verify payout account', button: 'Verify — turn on online payments' },
  NEEDS_CORRECTION: { title: 'Ask for a correction', button: 'Send back for correction' },
  REJECTED: { title: 'Reject payout account', button: 'Reject' },
};

function ReviewModal({ a, decision, onClose, onDone }: { a: PlatformPayoutAccount; decision: Decision; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [gateway, setGateway] = useState(a.gatewayAccountId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsNote = decision !== 'VERIFIED';
  const t = DECISION_TEXT[decision];

  async function submit() {
    setError(null);
    if (needsNote && note.trim().length < 3) return setError('Tell the mandal what to fix — this note is shown to them.');
    setBusy(true);
    try {
      await api.post(`/platform/payout-accounts/${a.organizationId}/review`, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === 'VERIFIED' && gateway.trim() ? { gatewayAccountId: gateway.trim() } : {}),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t.title}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          <span className="font-bold">{a.organization.name}</span> — {a.legalName}. Check the account holder name matches the PAN and the proof before verifying.
        </p>
        {decision === 'VERIFIED' && (
          <LabeledInput label="Gateway linked-account id (optional)" placeholder="acc_XXXXXXXXXXXX" value={gateway} onChange={(e) => setGateway(e.target.value)} maxLength={80} />
        )}
        <Field label={needsNote ? 'Note to the mandal (required)' : 'Note (optional)'}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={needsNote ? 'e.g. The account holder name does not match the PAN.' : ''} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button variant={decision === 'VERIFIED' ? 'success' : decision === 'REJECTED' ? 'danger' : 'primary'} loading={busy} onClick={() => void submit()}>
          {t.button}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Settlements & payouts ─────────────────────────────────────────

/** Pending net per mandal, from the oldest 200 pending settlements (the modal shows the exact total). */
function usePendingByOrg() {
  return useAsync(
    () =>
      api.get<Paged<Settlement>>('/platform/settlements', { status: 'PENDING_PAYOUT', pageSize: 200 }).then((r) => {
        const m = new Map<string, { org: IdName; amount: number; count: number }>();
        for (const s of r.items) {
          if (!s.organization) continue;
          const cur = m.get(s.organization.id) ?? { org: s.organization, amount: 0, count: 0 };
          cur.amount += Number(s.net);
          cur.count += 1;
          m.set(s.organization.id, cur);
        }
        return [...m.values()].sort((a, b) => b.amount - a.amount);
      }),
    [],
  );
}

function SettlementsSection({ onPayOut }: { onPayOut: (o: IdName) => void }) {
  const [status, setStatus] = useState('');
  const settlements = useSettlements('/platform/settlements', { status: status || undefined });
  const payouts = usePayouts('/platform/payouts');
  const pending = usePendingByOrg();
  return (
    <>
      <SectionTitle icon={ArrowDownToLine}>Split settlements</SectionTitle>
      {settlements.error && <Alert>{settlements.error}</Alert>}
      {settlements.data && <SettlementTotalsGrid totals={settlements.data.totals} netLabel="Net to mandals" />}

      {(pending.data ?? []).length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-bold text-slate-800">Waiting to be paid out</p>
          {(pending.data ?? []).map((p) => (
            <div key={p.org.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50/60 px-3 py-2 ring-1 ring-amber-100">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.org.name}</div>
                <div className="text-xs text-slate-500">{p.count} settlement{p.count === 1 ? '' : 's'}</div>
              </div>
              <span className="text-lg font-extrabold tabular-nums text-amber-700">{fmtMoney(p.amount.toFixed(2))}</span>
              <Button size="sm" onClick={() => onPayOut(p.org)}>
                <Send aria-hidden className="h-4 w-4" /> Pay out
              </Button>
            </div>
          ))}
        </Card>
      )}

      <div className="sm:w-60">
        <LabeledSelect label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All settlements</option>
          <option value="PENDING_PAYOUT">Pending payout</option>
          <option value="PAID_OUT">Paid out</option>
        </LabeledSelect>
      </div>
      <SettlementsList q={settlements} showOrg emptyText="Paid online passes from verified mandals appear here." />

      <SectionTitle icon={Landmark}>Payout history</SectionTitle>
      {payouts.error && <Alert>{payouts.error}</Alert>}
      <PayoutsList q={payouts} showOrg emptyText="Recorded bank transfers (with their UTR) show here." />
    </>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-orange-50 hover:text-orange-700"
    >
      {done ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />}
    </button>
  );
}

function PayoutModal({ org, onClose, onDone }: { org: IdName; onClose: () => void; onDone: () => void }) {
  const totals = useAsync(() => api.get<SettlementPage>('/platform/settlements', { organizationId: org.id, status: 'PENDING_PAYOUT', pageSize: 1 }), [org.id]);
  const [bank, setBank] = useState<RevealedBank | null>(null);
  const [bankErr, setBankErr] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(true);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ amount: string; reference: string; settlements: number } | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .post<RevealedBank>(`/platform/payout-accounts/${org.id}/reveal-bank`)
      .then((b) => alive && setBank(b))
      .catch((e) => alive && setBankErr(errorMessage(e)))
      .finally(() => alive && setRevealing(false));
    return () => {
      alive = false;
    };
  }, [org.id]);

  const pending = totals.data?.totals.pendingPayout ?? null;
  const nothing = pending !== null && Number(pending) <= 0;

  async function submit() {
    setError(null);
    if (reference.trim().length < 4) return setError('Enter the bank transfer reference (UTR), at least 4 characters.');
    setBusy(true);
    try {
      const r = await api.post<{ amount: string; reference: string; settlements: number }>('/platform/payouts', {
        organizationId: org.id,
        reference: reference.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setDone(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Modal open onClose={onDone} title="Payout recorded">
        <div className="flex flex-col gap-4">
          <Alert kind="success">
            {fmtMoney(done.amount)} paid to {org.name} · {done.settlements} settlement{done.settlements === 1 ? '' : 's'} closed · UTR {done.reference}
          </Alert>
          <Button onClick={onDone}>Done</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title={`Pay out — ${org.name}`}>
      <div className="flex flex-col gap-4">
        <Stat label="Pending payout (everything not yet paid)" value={pending === null ? '…' : fmtMoney(pending)} tone="amber" icon={Landmark} />
        {totals.error && <Alert>{totals.error}</Alert>}

        <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Landmark aria-hidden className="h-4 w-4" /> Transfer to
          </p>
          {revealing ? (
            <SkeletonList rows={1} />
          ) : bankErr ? (
            <Alert>{bankErr}</Alert>
          ) : bank ? (
            <dl className="flex flex-col divide-y divide-emerald-100">
              {(
                [
                  ['Account holder', bank.bankHolderName, false],
                  ['Account number', bank.bankAccount, true],
                  ['IFSC', bank.ifsc, true],
                  ['Account type', bank.accountType === 'CURRENT' ? 'Current' : 'Savings', false],
                ] as const
              ).map(([k, v, mono]) => (
                <div key={k} className="flex items-center gap-2 py-1">
                  <div className="min-w-0 flex-1">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
                    <dd className={cx('break-all text-base font-bold text-slate-900', mono && 'font-mono tracking-wide')}>{v}</dd>
                  </div>
                  <CopyButton value={v} label={k} />
                </div>
              ))}
            </dl>
          ) : null}
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800">
            <ShieldAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Showing the full account number is recorded in the mandal&apos;s audit log. Don&apos;t share or
            screenshot it.
          </p>
        </div>

        {nothing ? (
          <Alert kind="info">Nothing is pending for this mandal right now.</Alert>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm text-slate-700">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              Make the bank transfer first, then record its UTR here. This marks every pending settlement of this mandal as paid.
            </p>
            <LabeledInput label="Bank UTR / reference" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} maxLength={80} placeholder="e.g. HDFCN52026100112345" autoComplete="off" />
            <Field label="Note (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
            </Field>
            {error && <Alert>{error}</Alert>}
            <Button size="lg" loading={busy} disabled={!bank || pending === null} onClick={() => void submit()}>
              <Send aria-hidden className="h-5 w-5" /> Record payout {pending ? `of ${fmtMoney(pending)}` : ''}
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
