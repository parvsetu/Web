'use client';

import { useState } from 'react';
import { BadgeIndianRupee, CheckCircle2, ClipboardCheck, Hourglass, PencilLine, Rocket, Send, Wrench, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { EventApprovalDetail } from '@/lib/registration-types';
import type { ApprovalStatus } from '@/lib/types';
import { Declaration } from '../registration/Declaration';
import { ApprovalBadge, PayLinkActions, paymentLine } from '../registration/FeeStatus';
import { Alert, Button, Modal, cx } from '../ui';

const STEPS: { key: string; label: string; icon: typeof Wrench }[] = [
  { key: 'setup', label: 'Set up', icon: Wrench },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'pay', label: 'Pay fee', icon: BadgeIndianRupee },
  { key: 'live', label: 'Live', icon: Rocket },
];

function stepIndex(s: ApprovalStatus) {
  return s === 'DRAFT' || s === 'CHANGES_REQUESTED' ? 0 : s === 'SUBMITTED' ? 1 : s === 'APPROVED_AWAITING_PAYMENT' ? 2 : s === 'LIVE' ? 3 : 0;
}

/**
 * Shown on a festival's dashboard until it is LIVE: where it is in
 * set up → platform review → registration fee → live, with "Submit for
 * review" (declaration required) and the pay link once approved.
 */
export function EventApprovalCard() {
  const ev = useEvent();
  const status = ev.detail?.approvalStatus;
  const show = !!status && status !== 'LIVE';
  const q = useAsync(() => api.get<EventApprovalDetail>(`/events/${ev.eventId}/approval`), [ev.eventId, status], show);
  const [submitting, setSubmitting] = useState(false);
  if (!show || !status) return null;
  const a = q.data;
  const idx = stepIndex(status);
  const rejected = status === 'REJECTED';

  return (
    <section className={cx('no-print overflow-hidden rounded-3xl border shadow-sm', rejected ? 'border-red-200 bg-red-50' : 'border-violet-200 bg-gradient-to-br from-violet-50 via-white to-orange-50')}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <p className="text-sm font-bold text-slate-900">Platform review &amp; registration fee</p>
        <ApprovalBadge status={status} />
      </div>
      {!rejected && (
        <ol className="grid grid-cols-4 gap-1 px-4 pt-3" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-col items-center gap-1 text-center">
              <span className={cx('flex h-9 w-9 items-center justify-center rounded-full ring-2', i < idx ? 'bg-emerald-500 text-white ring-emerald-200' : i === idx ? 'bg-orange-500 text-white ring-orange-200' : 'bg-white text-slate-400 ring-slate-200')}>
                {i < idx ? <CheckCircle2 aria-hidden className="h-5 w-5" /> : <s.icon aria-hidden className="h-4 w-4" />}
              </span>
              <span className={cx('text-[11px] font-semibold leading-tight', i <= idx ? 'text-slate-800' : 'text-slate-400')}>{s.label}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-3 p-4">
        {q.error && <Alert>{q.error}</Alert>}
        {(status === 'DRAFT' || status === 'CHANGES_REQUESTED') && (
          <>
            {status === 'CHANGES_REQUESTED' && a?.reviewNote && <Alert kind="warning"><strong>Changes requested:</strong> {a.reviewNote}</Alert>}
            <p className="text-sm text-slate-700">
              This festival isn’t public yet. Set up slots, prices, venue and volunteers, then submit it for review.
              {a ? <> Registration fee: <strong>{fmtMoney(a.quote.fee)}</strong>.</> : null}
            </p>
            {a?.customFestival && <p className="text-xs text-violet-800">New event type “{a.customFestival.label}” ({a.customFestival.group}) will be reviewed with it.</p>}
            {can(ev.perms, 'EVENT_UPDATE') && (
              <Button onClick={() => setSubmitting(true)}>
                <Send aria-hidden className="h-4 w-4" /> Submit for review
              </Button>
            )}
          </>
        )}
        {status === 'SUBMITTED' && (
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <Hourglass aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>Submitted {a?.submittedAt ? fmtDateTime(a.submittedAt) : ''}. The Parvsetu team is reviewing it{a ? <> — quoted fee <strong>{fmtMoney(a.quote.fee)}</strong></> : null}. You can keep setting it up meanwhile.</span>
          </p>
        )}
        {status === 'APPROVED_AWAITING_PAYMENT' && a && (
          <>
            <p className="text-sm text-slate-700">Approved! Pay the registration fee of <strong>{fmtMoney(a.fee ?? a.quote.fee)}</strong> and the festival goes live straight away.</p>
            {a.payments[0] && <p className="text-xs text-slate-500">{paymentLine(a.payments[0])}</p>}
            {a.payments[0]?.payUrl ? (
              <PayLinkActions url={a.payments[0].payUrl} text={`Registration fee for ${ev.name} on Parvsetu:`} />
            ) : (
              <Alert kind="info">Ask the Parvsetu team for a new payment link.</Alert>
            )}
          </>
        )}
        {rejected && (
          <p className="flex items-start gap-2 text-sm text-red-900">
            <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span><strong>Not approved / unpublished.</strong> {a?.reviewNote ?? ''} Contact the Parvsetu team if you think this is a mistake.</span>
          </p>
        )}
      </div>
      {submitting && a && (
        <SubmitModal fee={a.quote.fee} onClose={() => setSubmitting(false)} onDone={() => { setSubmitting(false); q.reload(); ev.reloadDetail(); }} />
      )}
    </section>
  );
}

function SubmitModal({ fee, onClose, onDone }: { fee: string; onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!declared) return setError('Please tick the declaration to submit.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${ev.eventId}/submit`, { declarationAccepted: true });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Submit for review">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          The Parvsetu team checks <strong>{ev.name}</strong> before it is published. Once approved, pay the registration fee of <strong>{fmtMoney(fee)}</strong> and it goes live.
        </p>
        <Declaration checked={declared} onChange={(v) => { setDeclared(v); setError(null); }} error={error && !declared ? error : null} />
        {error && declared && <Alert>{error}</Alert>}
        <Button loading={busy} onClick={() => void submit()}>
          <PencilLine aria-hidden className="h-4 w-4" /> Submit for review
        </Button>
      </div>
    </Modal>
  );
}
