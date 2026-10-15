'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, ClipboardList, Hourglass, PencilLine, RefreshCw, Sparkles, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { REGISTRATION_LABEL, type MandalRegistration } from '@/lib/registration-types';
import { AppShell } from '@/components/AppShell';
import { FestivalBadge } from '@/components/FestivalBanner';
import { ApprovalBadge, PayLinkActions, paymentLine } from '@/components/registration/FeeStatus';
import { MandalRegistrationForm } from '@/components/registration/MandalRegistrationForm';
import { Alert, Badge, Button, Card, Empty, SkeletonList, cx } from '@/components/ui';

const STATUS_STYLE: Record<MandalRegistration['status'], { tone: string; icon: typeof Hourglass; text: string }> = {
  PENDING_VERIFICATION: { tone: 'from-slate-500 to-slate-700', icon: Hourglass, text: 'Verify your email to send this registration for review.' },
  PENDING_REVIEW: { tone: 'from-amber-400 to-orange-500', icon: Hourglass, text: 'The Parvsetu team is reviewing your mandal. We’ll email you when it’s done.' },
  CHANGES_REQUESTED: { tone: 'from-orange-500 to-rose-500', icon: PencilLine, text: 'A few changes are needed. Fix them below and resubmit.' },
  APPROVED: { tone: 'from-emerald-500 to-green-600', icon: CheckCircle2, text: 'Approved! Pay each festival’s registration fee to publish it.' },
  REJECTED: { tone: 'from-rose-500 to-red-600', icon: XCircle, text: 'This registration was not approved.' },
};

/** The applicant's view of their mandal registration(s): status, notes and per-festival pay links. */
export default function RegistrationStatusPage() {
  const { refresh } = useAuth();
  const q = useAsync(() => api.get<MandalRegistration[]>('/me/mandal-registrations'), []);
  return (
    <AppShell title="Mandal registration" subtitle="Review & festival fees">
      <div className="flex flex-col gap-4">
        {q.error && <Alert>{q.error}</Alert>}
        {q.loading && !q.data ? (
          <SkeletonList rows={3} />
        ) : !q.data?.length ? (
          <Empty icon={ClipboardList} title="No mandal registration yet">
            <Link href="/register?type=mandal" className="font-semibold text-orange-700 underline">Register your mandal</Link>
          </Empty>
        ) : (
          q.data.map((r) => <RegistrationCard key={r.id} r={r} onChanged={() => { q.reload(); void refresh(); }} />)
        )}
        <Button variant="secondary" onClick={() => { q.reload(); void refresh(); }}>
          <RefreshCw aria-hidden className="h-4 w-4" /> Refresh
        </Button>
      </div>
    </AppShell>
  );
}

function RegistrationCard({ r, onChanged }: { r: MandalRegistration; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const st = STATUS_STYLE[r.status];
  return (
    <div className="flex flex-col gap-3">
      <section className={cx('relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg', st.tone)}>
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
            <st.icon aria-hidden className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{REGISTRATION_LABEL[r.status]}</p>
            <h2 className="break-words text-xl font-extrabold leading-tight">{r.orgName}</h2>
            <p className="mt-1 text-sm text-white/90">{st.text}</p>
            <p className="mt-1 text-xs text-white/75">
              {[r.city, r.state].filter(Boolean).join(', ')}{r.agent ? ` · via agent ${r.agent.name}` : ''} · sent {fmtDateTime(r.submittedAt ?? r.createdAt)}
            </p>
          </div>
        </div>
      </section>

      {r.reviewNote && (r.status === 'CHANGES_REQUESTED' || r.status === 'REJECTED') && (
        <Alert kind={r.status === 'REJECTED' ? 'error' : 'warning'}>
          <strong>Note from the Parvsetu team:</strong> {r.reviewNote}
        </Alert>
      )}

      {r.status === 'APPROVED' && r.organization && (
        <Link href={`/org/${r.organization.id}`} className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 font-semibold shadow-sm hover:bg-orange-50">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <Building2 aria-hidden className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1 truncate">Manage {r.organization.name}</span>
        </Link>
      )}

      {r.status === 'APPROVED' ? (
        <div className="flex flex-col gap-3">
          {r.events.map((e) => (
            <Card key={e.id} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <FestivalBadge type={e.festivalType} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-slate-900">{e.name}</p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-600">
                    <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <ApprovalBadge status={e.approvalStatus} />
                    {e.fee && <span className="text-sm font-semibold text-slate-700">Fee {fmtMoney(e.fee)}</span>}
                  </div>
                </div>
              </div>
              {e.payment && <p className="text-sm text-slate-600">{paymentLine(e.payment)}</p>}
              {e.approvalStatus === 'APPROVED_AWAITING_PAYMENT' && e.payment?.payUrl && (
                <PayLinkActions url={e.payment.payUrl} text={`Registration fee for ${e.name} on Parvsetu:`} />
              )}
              {e.approvalStatus === 'LIVE' && (
                <Link href={`/e/${e.id}/admin`} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3 text-sm font-semibold text-white">
                  <Sparkles aria-hidden className="h-4 w-4" /> Live — open the festival dashboard
                </Link>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Festivals requested</p>
          <ul className="flex flex-col gap-2">
            {r.requestedEvents.map((e) => (
              <li key={e.index} className="flex items-center gap-3">
                <FestivalBadge type={e.festivalType} className="h-10 w-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{e.name}</p>
                  <p className="text-xs text-slate-500">
                    {e.custom ? `${e.custom.name} (new type · ${e.custom.group})` : humanize(e.festivalType)} · {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                  </p>
                </div>
                <Badge className="shrink-0 bg-orange-50 text-orange-800">{fmtMoney(e.quotedFee)}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Fees shown are quotes; the amount is confirmed when the Parvsetu team approves.</p>
        </Card>
      )}

      {r.status === 'CHANGES_REQUESTED' && (
        editing ? (
          <Card>
            <MandalRegistrationForm mode="edit" initial={r} onSubmitted={() => { setEditing(false); onChanged(); }} />
          </Card>
        ) : (
          <Button onClick={() => setEditing(true)}>
            <PencilLine aria-hidden className="h-4 w-4" /> Edit &amp; resubmit
          </Button>
        )
      )}
    </div>
  );
}
