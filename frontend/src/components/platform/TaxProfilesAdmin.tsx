'use client';

import { useState } from 'react';
import { BadgePercent, Check, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import { TAX_STATUS_LABEL, type TaxProfile } from '@/lib/tax-types';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SkeletonList } from '../ui';

type Row = TaxProfile & { organization: { id: string; name: string; city: string | null; state: string | null } };
const TONE: Record<string, string> = { DRAFT: 'bg-slate-100 text-slate-700', SUBMITTED: 'bg-amber-100 text-amber-800', VERIFIED: 'bg-green-100 text-green-800', REJECTED: 'bg-red-100 text-red-800' };

/** Super admin: verify mandals' 80G registrations (check the approval order) and set the deduction %. */
export function TaxProfilesAdmin() {
  const [status, setStatus] = useState('SUBMITTED');
  const q = usePagedList<Row>('/platform/tax-profiles', { status: status || undefined }, { pageSize: 20 });
  const [reviewing, setReviewing] = useState<Row | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">A mandal’s receipts claim 80G only after you verify its registration here. Check the URN and validity against its Form 10AC / 10AD approval order (e.g. on the income-tax portal) and set the deduction it allows. Verifying or rejecting re-checks every donation of that mandal.</p>
      <div className="sm:w-56">
        <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.entries(TAX_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </LabeledSelect>
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : q.items.length === 0 ? <Empty icon={BadgePercent} title={status === 'SUBMITTED' ? 'Nothing waiting for verification' : 'Nothing matches'} /> : (
        q.items.map((p) => (
          <Card key={p.organization.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 break-words font-bold">{p.organization.name}<span className="font-normal text-slate-500">{p.organization.city ? ` · ${p.organization.city}` : ''}</span></span>
              <Badge className={TONE[p.status]}>{TAX_STATUS_LABEL[p.status]}</Badge>
            </div>
            <p className="text-sm text-slate-700">URN <span className="font-mono font-semibold">{p.urn}</span> · issued {fmtDate(p.urnIssuedOn)} · valid {fmtDate(p.validFrom)} – {p.validTo ? fmtDate(p.validTo) : 'no end date'} · PAN {p.pan}{p.deductionPercent ? ` · ${p.deductionPercent}%` : ''}</p>
            {p.submittedAt && <p className="text-xs text-slate-500">Submitted {fmtDateTime(p.submittedAt)}{p.reviewNote ? ` · note: ${p.reviewNote}` : ''}</p>}
            {(p.status === 'SUBMITTED' || p.status === 'VERIFIED') && <Button size="sm" variant="secondary" onClick={() => setReviewing(p)}>{p.status === 'SUBMITTED' ? 'Review' : 'Withdraw verification'}</Button>}
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {reviewing && <Review p={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); q.reload(); }} />}
    </div>
  );
}

function Review({ p, onClose, onDone }: { p: Row; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState('50');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  async function decide(decision: 'VERIFY' | 'REJECT') {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ donationsReevaluated: number }>(`/platform/tax-profiles/${p.organization.id}/review`, { decision, ...(decision === 'VERIFY' ? { deductionPercent: Number(pct) } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      setDone(`${decision === 'VERIFY' ? 'Verified' : 'Rejected'} — ${r.donationsReevaluated} donations re-checked.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={done ? onDone : onClose} title={`80G — ${p.organization.name}`}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-700">URN <span className="font-mono font-semibold">{p.urn}</span>, valid {fmtDate(p.validFrom)} – {p.validTo ? fmtDate(p.validTo) : 'no end date'}, PAN {p.pan}.</p>
        {done ? <><Alert kind="success">{done}</Alert><Button onClick={onDone}>Done</Button></> : (
          <>
            {p.status === 'SUBMITTED' && (
              <LabeledSelect label="Deduction allowed (from the approval)" value={pct} onChange={(e) => setPct(e.target.value)}>
                <option value="50">50% (most 80G approvals)</option>
                <option value="100">100% (specified funds)</option>
              </LabeledSelect>
            )}
            <LabeledInput required={p.status !== 'SUBMITTED'} label={p.status === 'SUBMITTED' ? 'Note (required to reject)' : 'Why is the verification withdrawn?'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            {error && <Alert>{error}</Alert>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {p.status === 'SUBMITTED' && <Button variant="success" loading={busy} onClick={() => void decide('VERIFY')}><Check aria-hidden className="h-4 w-4" /> Verify</Button>}
              <Button variant="danger" loading={busy} disabled={!note.trim()} onClick={() => void decide('REJECT')}><X aria-hidden className="h-4 w-4" /> {p.status === 'SUBMITTED' ? 'Reject' : 'Withdraw'}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
