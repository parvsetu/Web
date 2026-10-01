'use client';

import { useState } from 'react';
import { Ban, BriefcaseBusiness, Building2, CalendarDays, Check, Link2, Mail, MapPin, RotateCcw, Sparkles, Ticket, Undo2, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, humanize } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import type { ReviewEvent } from '@/lib/registration-types';
import type { ApprovalStatus } from '@/lib/types';
import { FestivalBadge } from '../FestivalBanner';
import { ApprovalBadge, PayLinkActions, paymentLine } from '../registration/FeeStatus';
import { SearchBar } from '../SearchBar';
import { Alert, Button, Card, Checkbox, Empty, LabeledInput, Modal, Pager, SkeletonList } from '../ui';
import { MarkPaidModal, StatusPills, TextActionModal } from './ReviewParts';

const FILTERS: { key: ApprovalStatus; label: string }[] = [
  { key: 'SUBMITTED', label: 'To review' },
  { key: 'APPROVED_AWAITING_PAYMENT', label: 'Fee due' },
  { key: 'LIVE', label: 'Live' },
  { key: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'DRAFT', label: 'Drafts' },
];

type Action = 'approve' | 'changes' | 'reject' | 'unpublish' | 'paid' | 'waive' | 'refund';

/** Super admin: per-event review queue, pay links, manual payment / waiver / refund and policy unpublishing. */
export function EventReviewsAdmin() {
  const [status, setStatus] = useState<ApprovalStatus>('SUBMITTED');
  const q = usePagedList<ReviewEvent>('/platform/event-reviews', { status }, { pageSize: 10 });
  const [action, setAction] = useState<{ e: ReviewEvent; kind: Action } | null>(null);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const close = () => setAction(null);
  const done = () => { setAction(null); q.reload(); };

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMsg(null);
    try {
      const r = await fn();
      setMsg({ kind: 'success', text: typeof r === 'string' ? r : ok });
      q.reload();
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusPills value={status} onChange={setStatus} options={FILTERS} />
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search festival, mandal or city" total={q.total} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        <Empty icon={Ticket} title={status === 'SUBMITTED' ? 'No festivals waiting for review' : 'Nothing here'} />
      ) : (
        q.items.map((e) => {
          const open = e.payments.find((p) => p.payUrl);
          const paid = e.payments.find((p) => p.status === 'PAID');
          return (
            <Card key={e.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <FestivalBadge type={e.festivalType} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-orange-700">{e.customFestival ? e.customFestival.label : humanize(e.festivalType)}</p>
                    <ApprovalBadge status={e.approval.status} />
                  </div>
                  <p className="break-words text-lg font-bold leading-tight">{e.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-600"><Building2 aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{e.organization.name}{e.organization.city ? `, ${e.organization.city}` : ''}</span></p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)}</p>
                  {(e.location || e.venueAddress) && <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{[e.location, e.venueAddress].filter(Boolean).join(' · ')}</span></p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {e.organization.agent && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    <BriefcaseBusiness aria-hidden className="h-3.5 w-3.5" /> Via agent {e.organization.agent.name}
                  </span>
                )}
                {e.customFestival && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-800 ring-1 ring-violet-200">
                    <Sparkles aria-hidden className="h-3.5 w-3.5" /> Not-listed type · {e.customFestival.group} · {e.customFestival.status.toLowerCase()}{e.customFestival.inCatalog ? ' · in catalog' : ''}
                  </span>
                )}
                {e.approval.legacy && <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">Legacy (pre-fee)</span>}
                {e.approval.submittedAt && <span className="py-1 text-slate-500">Submitted {fmtDateTime(e.approval.submittedAt)}</span>}
                <span className="py-1 text-slate-500">{e.passesIssued} passes</span>
              </div>
              {e.customFestival?.description && <p className="text-sm italic text-slate-600">“{e.customFestival.description}”</p>}
              {e.description && <p className="line-clamp-3 text-sm text-slate-700">{e.description}</p>}
              <p className="text-sm text-slate-700">
                Fee: <strong>{fmtMoney(e.approval.fee ?? e.approval.feeQuoted ?? '0')}</strong>
                {e.approval.fee === null && e.approval.feeQuoted ? ' (quoted)' : ''}
                {e.approval.reviewNote ? <span className="block text-xs text-slate-500">Note: {e.approval.reviewNote}</span> : null}
              </p>
              {e.payments[0] && <p className="text-xs text-slate-500">Latest payment: {paymentLine(e.payments[0])}</p>}

              {e.approval.status === 'SUBMITTED' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="success" onClick={() => setAction({ e, kind: 'approve' })}><Check aria-hidden className="h-4 w-4" /> Approve</Button>
                  <Button variant="secondary" onClick={() => setAction({ e, kind: 'changes' })}>Request changes</Button>
                  <Button variant="ghost" className="!text-red-700" onClick={() => setAction({ e, kind: 'reject' })}><X aria-hidden className="h-4 w-4" /> Reject</Button>
                </div>
              )}
              {e.approval.status === 'APPROVED_AWAITING_PAYMENT' && (
                <div className="flex flex-col gap-2">
                  {open?.payUrl ? (
                    <PayLinkActions url={open.payUrl} text={`Namaste! ${e.name} is approved on Parvsetu. Pay the registration fee of ${fmtMoney(e.approval.fee ?? '0')} here to go live:`} />
                  ) : (
                    <Alert kind="warning">No open pay link (expired or cancelled). Create a new one.</Alert>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Button size="sm" variant="secondary" onClick={() => void run(() => api.post(`/platform/events/${e.id}/fee/link`), 'New pay link created — the old one no longer works.')}><Link2 aria-hidden className="h-4 w-4" /> New link</Button>
                    <Button size="sm" variant="secondary" disabled={!open} onClick={() => void run(async () => {
                      const r = await api.post<{ sentTo: string[] }>(`/platform/events/${e.id}/fee/email`);
                      return `Pay link emailed to ${r.sentTo.join(', ')}.`;
                    }, 'Pay link emailed.')}><Mail aria-hidden className="h-4 w-4" /> Email</Button>
                    <Button size="sm" variant="success" onClick={() => setAction({ e, kind: 'paid' })}>Mark paid</Button>
                    <Button size="sm" variant="secondary" onClick={() => setAction({ e, kind: 'waive' })}>Waive fee</Button>
                  </div>
                  <Button size="sm" variant="ghost" className="!text-red-700" onClick={() => setAction({ e, kind: 'reject' })}><X aria-hidden className="h-4 w-4" /> Reject</Button>
                </div>
              )}
              {e.approval.status === 'LIVE' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="danger" size="sm" onClick={() => setAction({ e, kind: 'unpublish' })}><Ban aria-hidden className="h-4 w-4" /> Unpublish (policy)</Button>
                  {paid && <Button variant="secondary" size="sm" onClick={() => setAction({ e, kind: 'refund' })}><Undo2 aria-hidden className="h-4 w-4" /> Refund fee</Button>}
                </div>
              )}
              {(e.approval.status === 'CHANGES_REQUESTED' || e.approval.status === 'DRAFT') && (
                <Button size="sm" variant="ghost" className="!text-red-700" onClick={() => setAction({ e, kind: 'reject' })}><X aria-hidden className="h-4 w-4" /> Reject</Button>
              )}
            </Card>
          );
        })
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />

      {action?.kind === 'approve' && <ApproveEventModal e={action.e} onClose={close} onDone={done} />}
      {action?.kind === 'paid' && <MarkPaidModal eventId={action.e.id} eventName={action.e.name} amount={action.e.approval.fee} onClose={close} onDone={done} />}
      {action?.kind === 'changes' && (
        <TextActionModal title={`Request changes — ${action.e.name}`} label="What should the mandal change?" confirm="Send back" onClose={close}
          onSubmit={async (note) => { await api.post(`/platform/events/${action.e.id}/request-changes`, { note }); q.reload(); }} />
      )}
      {action?.kind === 'reject' && (
        <TextActionModal danger title={`Reject — ${action.e.name}`} label="Reason (shown to the mandal)" confirm="Reject festival" onClose={close}
          onSubmit={async (reason) => { await api.post(`/platform/events/${action.e.id}/reject`, { reason }); q.reload(); }} />
      )}
      {action?.kind === 'unpublish' && (
        <TextActionModal danger title={`Unpublish — ${action.e.name}`} label="Policy violation (shown to the mandal, audited)" placeholder="e.g. Liquor being sold at the venue" confirm="Unpublish now" onClose={close}
          onSubmit={async (reason) => { await api.post(`/platform/events/${action.e.id}/unpublish`, { reason }); q.reload(); }} />
      )}
      {action?.kind === 'waive' && (
        <TextActionModal title={`Waive fee — ${action.e.name}`} label="Why is the fee waived?" placeholder="e.g. Charity event / launch offer" confirm="Waive & publish" onClose={close}
          onSubmit={async (reason) => { await api.post(`/platform/events/${action.e.id}/fee/waive`, { reason }); q.reload(); }} />
      )}
      {action?.kind === 'refund' && (
        <TextActionModal title={`Refund fee — ${action.e.name}`} label={action.e.passesIssued ? `Reason (${action.e.passesIssued} passes issued — the festival stays live)` : 'Reason (no passes yet — the festival goes back to “fee due”)'} confirm="Record refund" onClose={close}
          onSubmit={async (reason) => { await api.post(`/platform/events/${action.e.id}/fee/refund`, { reason }); q.reload(); }} />
      )}
    </div>
  );
}

function ApproveEventModal({ e, onClose, onDone }: { e: ReviewEvent; onClose: () => void; onDone: () => void }) {
  const [fee, setFee] = useState(e.approval.feeQuoted ?? '0');
  const [catalog, setCatalog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Approve ${e.name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">The fee is locked now. A pay link is created for the mandal; a ₹0 fee publishes it straight away.</p>
        <LabeledInput label="Registration fee (₹)" inputMode="decimal" value={fee} onChange={(ev) => setFee(ev.target.value.replace(/[^\d.]/g, ''))} hint={e.approval.feeQuoted ? `Quoted ${fmtMoney(e.approval.feeQuoted)} (${(e.approval.feeSource ?? '').toLowerCase().replace('_', ' ')})` : undefined} />
        {e.customFestival && (
          <div className="rounded-xl bg-violet-50 px-3">
            <Checkbox label={`Add “${e.customFestival.label}” to the catalog for every mandal`} checked={catalog} onChange={setCatalog} />
          </div>
        )}
        {error && <Alert>{error}</Alert>}
        <Button variant="success" loading={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api.post(`/platform/events/${e.id}/approve`, { fee: fee.trim() || '0', addToCatalog: e.customFestival ? catalog : undefined });
            onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}>
          <Check aria-hidden className="h-4 w-4" /> Approve
        </Button>
        <p className="flex items-center gap-1 text-xs text-slate-500"><RotateCcw aria-hidden className="h-3 w-3" /> You can still waive the fee or mark it paid later.</p>
      </div>
    </Modal>
  );
}
