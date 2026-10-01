'use client';

import { useState } from 'react';
import { BriefcaseBusiness, CalendarDays, Check, ClipboardCheck, Mail, MapPin, Phone, ShieldCheck, Sparkles, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney, humanize } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import { REGISTRATION_LABEL, type MandalRegistration } from '@/lib/registration-types';
import type { RegistrationStatus } from '@/lib/types';
import { FestivalBadge } from '../FestivalBanner';
import { ApprovalBadge } from '../registration/FeeStatus';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Button, Card, Checkbox, Empty, Input, LabeledInput, Modal, Pager, SkeletonList } from '../ui';
import { StatusPills, TextActionModal } from './ReviewParts';

const FILTERS: { key: RegistrationStatus; label: string }[] = [
  { key: 'PENDING_REVIEW', label: 'To review' },
  { key: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'PENDING_VERIFICATION', label: 'Email unverified' },
];

/** Super admin: mandal registrations (self / agent) — approve, request changes or reject. */
export function RegistrationsAdmin() {
  const [status, setStatus] = useState<RegistrationStatus>('PENDING_REVIEW');
  const q = usePagedList<MandalRegistration>('/platform/mandal-registrations', { status }, { pageSize: 10 });
  const [action, setAction] = useState<{ r: MandalRegistration; kind: 'approve' | 'changes' | 'reject' } | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <StatusPills value={status} onChange={setStatus} options={FILTERS} />
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search mandal, city, contact or mobile" total={q.total} />
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        <Empty icon={ClipboardCheck} title={status === 'PENDING_REVIEW' ? 'Nothing waiting for review' : 'No registrations here'} />
      ) : (
        q.items.map((r) => (
          <Card key={r.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-lg font-bold">{r.orgName}</p>
                <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> {[r.address, r.city, r.state].filter(Boolean).join(', ') || '—'}</p>
              </div>
              <Badge value={r.status === 'APPROVED' ? 'APPROVED' : r.status === 'REJECTED' ? 'REJECTED' : 'PENDING'}>{REGISTRATION_LABEL[r.status]}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
              <span className="font-semibold">{r.contactName}</span>
              <a href={`tel:${r.contactMobile}`} className="inline-flex items-center gap-1 hover:underline"><Phone aria-hidden className="h-3.5 w-3.5" /> {r.contactMobile}</a>
              <a href={`mailto:${r.contactEmail}`} className="inline-flex min-w-0 items-center gap-1 break-all hover:underline"><Mail aria-hidden className="h-3.5 w-3.5 shrink-0" /> {r.contactEmail}</a>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {r.agent ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  <BriefcaseBusiness aria-hidden className="h-3.5 w-3.5" /> {r.source === 'AGENT' ? 'Registered via agent' : 'Referred by agent'} {r.agent.name} ({r.agent.code})
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">Self-registered</span>
              )}
              <span className="text-slate-500">Sent {fmtDateTime(r.submittedAt ?? r.createdAt)}</span>
              <span className="inline-flex items-center gap-1 text-slate-500"><ShieldCheck aria-hidden className="h-3.5 w-3.5 text-green-600" /> Declaration accepted</span>
            </div>
            {r.reviewNote && <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-900">Note: {r.reviewNote}</p>}
            <div className="flex flex-col gap-2">
              {r.status === 'APPROVED'
                ? r.events.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
                    <FestivalBadge type={e.festivalType} className="h-9 w-9" />
                    <span className="min-w-0 flex-1 break-words text-sm font-semibold">{e.name}</span>
                    <ApprovalBadge status={e.approvalStatus} />
                    {e.fee && <span className="text-sm tabular-nums">{fmtMoney(e.fee)}</span>}
                  </div>
                ))
                : r.requestedEvents.map((e) => (
                  <div key={e.index} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
                    <FestivalBadge type={e.festivalType} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.custom ? <span className="font-semibold text-violet-700">New type: {e.custom.name} · {e.custom.group}</span> : humanize(e.festivalType)}
                        {' · '}<CalendarDays aria-hidden className="inline h-3 w-3" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)}{e.location ? ` · ${e.location}` : ''}
                      </p>
                      {e.custom?.description && <p className="text-xs italic text-slate-600">“{e.custom.description}”</p>}
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{fmtMoney(e.quotedFee)}</span>
                  </div>
                ))}
            </div>
            {r.status === 'PENDING_REVIEW' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button variant="success" onClick={() => setAction({ r, kind: 'approve' })}><Check aria-hidden className="h-4 w-4" /> Approve</Button>
                <Button variant="secondary" onClick={() => setAction({ r, kind: 'changes' })}>Request changes</Button>
                <Button variant="ghost" className="!text-red-700" onClick={() => setAction({ r, kind: 'reject' })}><X aria-hidden className="h-4 w-4" /> Reject</Button>
              </div>
            )}
            {(r.status === 'CHANGES_REQUESTED' || r.status === 'PENDING_VERIFICATION') && (
              <Button variant="ghost" className="!text-red-700" onClick={() => setAction({ r, kind: 'reject' })}><X aria-hidden className="h-4 w-4" /> Reject</Button>
            )}
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {action?.kind === 'approve' && <ApproveModal r={action.r} onClose={() => setAction(null)} onDone={() => { setAction(null); q.reload(); }} />}
      {action?.kind === 'changes' && (
        <TextActionModal title={`Request changes — ${action.r.orgName}`} label="What should they change? (sent to the applicant)" confirm="Send back for changes"
          onClose={() => setAction(null)} onSubmit={async (note) => { await api.post(`/platform/mandal-registrations/${action.r.id}/request-changes`, { note }); q.reload(); }} />
      )}
      {action?.kind === 'reject' && (
        <TextActionModal danger title={`Reject — ${action.r.orgName}`} label="Reason (sent to the applicant)" placeholder="e.g. Liquor stall listed in the programme" confirm="Reject registration"
          onClose={() => setAction(null)} onSubmit={async (reason) => { await api.post(`/platform/mandal-registrations/${action.r.id}/reject`, { reason }); q.reload(); }} />
      )}
    </div>
  );
}

function ApproveModal({ r, onClose, onDone }: { r: MandalRegistration; onClose: () => void; onDone: () => void }) {
  const [fees, setFees] = useState<Record<number, string>>(() => Object.fromEntries(r.requestedEvents.map((e) => [e.index, e.quotedFee])));
  const [catalog, setCatalog] = useState<Record<number, boolean>>({});
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function approve() {
    if (slug && !/^[a-z0-9-]{2,60}$/.test(slug)) return setError('Web address: lowercase letters, digits and hyphens only.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/platform/mandal-registrations/${r.id}/approve`, {
        slug: slug || undefined,
        events: r.requestedEvents.map((e) => ({ index: e.index, fee: (fees[e.index] ?? e.quotedFee).trim() || '0', addToCatalog: e.custom ? !!catalog[e.index] : undefined })),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Approve ${r.orgName}`} wide>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">Creates the mandal, makes {r.contactName} its Mandal Admin, sets its festival types to these, and opens a pay link per festival (a ₹0 fee goes live straight away).</p>
        {r.requestedEvents.map((e) => (
          <div key={e.index} className="flex flex-col gap-2 rounded-2xl border border-orange-100 p-3">
            <div className="flex items-center gap-2">
              <FestivalBadge type={e.festivalType} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{e.name}</p>
                <p className="text-xs text-slate-500">{e.custom ? `New type “${e.custom.name}” (${e.custom.group})` : humanize(e.festivalType)} · quote {fmtMoney(e.quotedFee)} ({e.feeSource.toLowerCase().replace('_', ' ')})</p>
              </div>
            </div>
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2">
              <LabeledInput label="Registration fee (₹)" inputMode="decimal" value={fees[e.index] ?? ''} onChange={(ev) => setFees((f) => ({ ...f, [e.index]: ev.target.value.replace(/[^\d.]/g, '') }))} />
              {e.custom && (
                <div className="flex items-center gap-1 rounded-xl bg-violet-50 px-3">
                  <Sparkles aria-hidden className="h-4 w-4 shrink-0 text-violet-600" />
                  <Checkbox label="Add this type to the catalog for everyone" checked={!!catalog[e.index]} onChange={(v) => setCatalog((c) => ({ ...c, [e.index]: v }))} />
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-semibold text-slate-800" htmlFor="appr-slug">Web address (optional)</label>
          <Input id="appr-slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="auto from the name, e.g. shiv-shakti-mitra-mandal" />
        </div>
        {error && <Alert>{error}</Alert>}
        <Button variant="success" loading={busy} onClick={() => void approve()}>
          <Check aria-hidden className="h-4 w-4" /> Approve &amp; create mandal
        </Button>
      </div>
    </Modal>
  );
}
