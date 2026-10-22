'use client';

import { useState } from 'react';
import { BadgeCheck, Download, FileCheck2, FileText, Info, Landmark, Save, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { fmtDate, fmtMoney, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import { TAX_STATUS_LABEL, recentFys, type TaxProfile, type TaxYear } from '@/lib/tax-types';
import { Alert, Badge, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, SectionTitle, SkeletonList, Stat, Table, Td, cx } from '../ui';

const STATUS_TONE: Record<string, string> = { DRAFT: 'bg-slate-100 text-slate-700', SUBMITTED: 'bg-amber-100 text-amber-800', VERIFIED: 'bg-green-100 text-green-800', REJECTED: 'bg-red-100 text-red-800' };

/**
 * Mandal → 80G & Form 10BD: the mandal's 80G registration (verified by
 * Parvsetu before any receipt claims a deduction), then per financial year the
 * eligible donations per donor, the Form 10BD upload sheet, the filing record
 * and Form 10BE issue. The server decides eligibility; this only shows it.
 */
export function TaxTab() {
  const { orgId, perms } = useOrg();
  const manage = can(perms, 'DONATION_TAX_MANAGE');
  const profile = useAsync(() => api.get<TaxProfile | null>(`/organizations/${orgId}/tax-profile`), [orgId]);
  const [fy, setFy] = useState(recentFys()[0]);
  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        <span className="flex items-start gap-2"><Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Receipts say a donation is eligible for 80G only when your 80G registration is verified by Parvsetu, the donation is within its validity, it isn’t anonymous or refunded, cash is within the 80G cash limit, and the donor’s PAN (or other ID) is recorded. Have your CA check the Form 10BD sheet before you file it.</span>
        </span>
      </Alert>
      {profile.loading && !profile.data ? <SkeletonList rows={1} /> : <ProfileCard orgId={orgId} p={profile.data ?? null} manage={manage} onSaved={profile.reload} />}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionTitle icon={FileText}>Form 10BD &amp; 10BE</SectionTitle>
        <div className="w-40">
          <LabeledSelect label="Financial year" value={fy} onChange={(e) => setFy(e.target.value)}>
            {recentFys().map((y) => <option key={y} value={y}>FY {y}</option>)}
          </LabeledSelect>
        </div>
      </div>
      <YearView orgId={orgId} fy={fy} manage={manage} canExport={manage && can(perms, 'REPORT_EXPORT')} />
    </div>
  );
}

function ProfileCard({ orgId, p, manage, onSaved }: { orgId: string; p: TaxProfile | null; manage: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(!p);
  const [f, setF] = useState({ urn: p?.urn ?? '', urnIssuedOn: p?.urnIssuedOn ?? '', validFrom: p?.validFrom ?? '', validTo: p?.validTo ?? '', pan: '', sectionCode: p?.sectionCode ?? 'Section 80G' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/organizations/${orgId}/tax-profile`, {
        urn: f.urn.trim(), urnIssuedOn: f.urnIssuedOn, validFrom: f.validFrom, pan: f.pan.trim(),
        ...(f.validTo ? { validTo: f.validTo } : {}), ...(f.sectionCode.trim() ? { sectionCode: f.sectionCode.trim() } : {}),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="flex flex-col gap-3">
      <SectionTitle icon={Landmark} action={p && <Badge className={STATUS_TONE[p.status]}>{TAX_STATUS_LABEL[p.status]}</Badge>}>80G registration</SectionTitle>
      {p && !editing && (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">URN</dt><dd className="font-mono font-semibold">{p.urn}</dd></div>
            <div><dt className="text-slate-500">Issued on</dt><dd className="font-semibold">{fmtDate(p.urnIssuedOn)}</dd></div>
            <div><dt className="text-slate-500">Valid</dt><dd className="font-semibold">{fmtDate(p.validFrom)} – {p.validTo ? fmtDate(p.validTo) : 'no end date'}{p.expired ? ' (expired)' : ''}</dd></div>
            <div><dt className="text-slate-500">Mandal PAN</dt><dd className="font-mono font-semibold">{p.pan}</dd></div>
            <div><dt className="text-slate-500">Deduction</dt><dd className="font-semibold">{p.deductionPercent ? `${p.deductionPercent}%` : 'Set at verification'}</dd></div>
            <div><dt className="text-slate-500">Section code</dt><dd className="font-semibold">{p.sectionCode}</dd></div>
          </dl>
          {p.status === 'SUBMITTED' && <Alert kind="info">Parvsetu is checking your 80G approval. Until then receipts don’t mention 80G.</Alert>}
          {p.status === 'REJECTED' && <Alert kind="warning">Not verified{p.reviewNote ? ` — ${p.reviewNote}` : ''}. Correct the details and submit again.</Alert>}
          {p.expired && <Alert kind="warning">This registration has expired — donations after {fmtDate(p.validTo!)} aren’t 80G-eligible. Enter your renewed approval.</Alert>}
          {manage && <Button variant="secondary" onClick={() => setEditing(true)}>Update 80G details</Button>}
          {manage && p.status === 'VERIFIED' && <p className="text-xs text-slate-500">Changing verified details sends them back for verification; receipts stop claiming 80G until then.</p>}
        </>
      )}
      {(!p || editing) && (manage ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          {!p && <p className="text-sm text-slate-600">Enter the details from your 80G approval order (Form 10AC / 10AD). Parvsetu verifies them before receipts mention 80G.</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput required label="80G URN (Unique Registration Number)" value={f.urn} onChange={(e) => setF((x) => ({ ...x, urn: e.target.value.toUpperCase().replace(/\s/g, '') }))} maxLength={30} placeholder="AAATS1234AF20214" />
            <LabeledInput required label="URN issued on" type="date" value={f.urnIssuedOn} onChange={set('urnIssuedOn')} />
            <LabeledInput required label="Valid from" type="date" value={f.validFrom} onChange={set('validFrom')} />
            <LabeledInput label="Valid to (blank if no end date)" type="date" value={f.validTo} onChange={set('validTo')} />
            <LabeledInput required label="Mandal / trust PAN" value={f.pan} onChange={(e) => setF((x) => ({ ...x, pan: e.target.value.toUpperCase().replace(/\s/g, '') }))} maxLength={10} placeholder={p ? `${p.pan} — re-enter to change` : 'AAATS1234F'} hint="Stored encrypted; shown masked." />
            <LabeledInput label="Section code (Form 10BD)" value={f.sectionCode} onChange={set('sectionCode')} maxLength={40} />
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy}><Save aria-hidden className="h-4 w-4" /> Submit for verification</Button>
            {p && <Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
          </div>
        </form>
      ) : <p className="text-sm text-slate-600">No 80G registration entered yet.</p>)}
    </Card>
  );
}

const BE_LABEL = { AWAITING_10BD: 'Awaiting Form 10BD', READY: 'Download from portal', ISSUED: 'Issued' } as const;
const BE_TONE = { AWAITING_10BD: 'bg-slate-100 text-slate-700', READY: 'bg-amber-100 text-amber-800', ISSUED: 'bg-green-100 text-green-800' } as const;

function YearView({ orgId, fy, manage, canExport }: { orgId: string; fy: string; manage: boolean; canExport: boolean }) {
  const q = useAsync(() => api.get<TaxYear>(`/organizations/${orgId}/tax/year`, { fy }), [orgId, fy]);
  const [filing, setFiling] = useState(false);
  const [issuing, setIssuing] = useState<TaxYear['donors'][number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const y = q.data;
  if (q.error) return <Alert>{q.error}</Alert>;
  if (!y) return <SkeletonList rows={2} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Donations received" value={fmtMoney(y.totals.donations)} tone="slate" />
        <Stat label={`80G-eligible (${y.totals.eligibleDonations})`} value={fmtMoney(y.totals.eligible)} tone="green" icon={BadgeCheck} />
        <Stat label="Donors in Form 10BD" value={y.totals.donors} tone="blue" />
        <Stat label="Due by" value={fmtDate(y.dueDate)} tone="amber" />
      </div>
      {y.ineligible.length > 0 && (
        <Card className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">Not eligible for 80G</p>
          {y.ineligible.map((i) => <p key={i.reason} className="flex justify-between gap-2 text-slate-700"><span>{i.label}</span><span className="tabular-nums">{i.count} · {fmtMoney(i.amount)}</span></p>)}
          <p className="text-xs text-slate-500">Add missing donor PANs from each festival’s Donations tab.</p>
        </Card>
      )}
      {Number(y.anonymous.total) > 0 && (
        <Alert kind={Number(y.anonymous.above) > 0 ? 'warning' : 'info'}>
          Anonymous donations this year: {fmtMoney(y.anonymous.total)}. Under section 115BBC, anonymous donations above {fmtMoney(y.anonymous.threshold)} (the higher of 5% of all donations or ₹1 lakh) may be taxable for some trusts
          {Number(y.anonymous.above) > 0 ? ` — ${fmtMoney(y.anonymous.above)} is above that.` : '.'} Ask your CA; Parvsetu does not compute tax.
        </Alert>
      )}

      <Card className="flex flex-col gap-3">
        <SectionTitle icon={FileCheck2}>Form 10BD (statement of donations)</SectionTitle>
        {y.filing ? (
          <div className={cx('rounded-xl px-3 py-2 text-sm', y.filing.status === 'FILED' ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900')}>
            {y.filing.status === 'FILED' ? <ShieldCheck aria-hidden className="mr-1 inline h-4 w-4" /> : <TriangleAlert aria-hidden className="mr-1 inline h-4 w-4" />}
            Filed on {fmtDate(y.filing.filedOn)} · acknowledgement {y.filing.ackNumber} · {y.filing.donors} donors · {fmtMoney(y.filing.total)}
            {y.filing.status === 'REVISION_NEEDED' && <span className="block font-semibold">{y.filing.revisionNote ?? 'Needs a correction.'} File the corrected statement and record it here.</span>}
          </div>
        ) : (
          <p className="text-sm text-slate-600">Not filed yet. Download the sheet, check it with your CA, upload it on the income-tax portal (Form 10BD), then record the acknowledgement here.</p>
        )}
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <Button variant="secondary" disabled={!y.profile || y.profile.status !== 'VERIFIED' || y.totals.donors === 0}
              onClick={() => void downloadFile(`/organizations/${orgId}/tax/year`, { fy, format: 'csv' }, `form-10bd-${fy}.csv`).catch((e) => setError(errorMessage(e)))}>
              <Download aria-hidden className="h-4 w-4" /> Download Form 10BD sheet (full donor IDs)
            </Button>
          )}
          {manage && y.totals.donors > 0 && y.profile?.status === 'VERIFIED' && (
            <Button onClick={() => setFiling(true)}>{y.filing ? 'Record a corrected filing' : 'Record Form 10BD filing'}</Button>
          )}
        </div>
        {y.filings.length > 1 && <p className="text-xs text-slate-500">Earlier filings: {y.filings.slice(1).map((f) => `${f.ackNumber} (${fmtDate(f.filedOn)}, ${f.status.toLowerCase()})`).join(' · ')}</p>}
      </Card>

      <SectionTitle icon={FileText}>Donors &amp; Form 10BE</SectionTitle>
      {y.donors.length === 0 ? (
        <Empty title="No 80G-eligible donations in this year" />
      ) : (
        <Card>
          <Table head={['Donor', 'ID', 'Donations', 'Amount', 'Form 10BE', '']}>
            {y.donors.map((d) => (
              <tr key={d.donorKey}>
                <Td className="font-semibold">{d.name}<span className="block text-xs font-normal text-slate-500">{d.address ?? ''}</span></Td>
                <Td className="font-mono text-xs">{d.donorId}</Td>
                <Td className="text-xs">{d.donations}<span className="block text-slate-500">{d.receipts.join(', ')}</span></Td>
                <Td className="tabular-nums">{fmtMoney(d.total)}</Td>
                <Td>
                  <Badge className={BE_TONE[d.form10BE.status]}>{BE_LABEL[d.form10BE.status]}</Badge>
                  {d.form10BE.status === 'ISSUED' && <span className="block font-mono text-xs">{d.form10BE.certificateNo}{d.form10BE.version > 1 ? ` (v${d.form10BE.version})` : ''}</span>}
                </Td>
                <Td>{manage && d.form10BE.status !== 'AWAITING_10BD' && <Button size="sm" variant="secondary" onClick={() => setIssuing(d)}>{d.form10BE.status === 'ISSUED' ? 'Re-issue' : 'Record 10BE'}</Button>}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <p className="text-xs text-slate-500">Form 10BE certificates are generated by the income-tax portal after Form 10BD is filed. Download each donor’s certificate there, give it to them, and record its number here.</p>
      {filing && <FileModal orgId={orgId} fy={fy} onClose={() => setFiling(false)} onDone={() => { setFiling(false); q.reload(); }} />}
      {issuing && <IssueModal orgId={orgId} fy={fy} donor={issuing} onClose={() => setIssuing(null)} onDone={() => { setIssuing(null); q.reload(); }} />}
    </div>
  );
}

function FileModal({ orgId, fy, onClose, onDone }: { orgId: string; fy: string; onClose: () => void; onDone: () => void }) {
  const [ack, setAck] = useState('');
  const [on, setOn] = useState(todayIn());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/organizations/${orgId}/tax/years/${fy}/form-10bd`, { ackNumber: ack.trim(), filedOn: on });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Form 10BD filed — FY ${fy}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Record this after uploading the statement on the income-tax portal. It covers every 80G-eligible donation of the year as it stands now.</p>
        <LabeledInput required label="Acknowledgement number" value={ack} onChange={(e) => setAck(e.target.value)} maxLength={60} />
        <LabeledInput label="Filed on" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={ack.trim().length < 4}>Save filing</Button>
      </form>
    </Modal>
  );
}

function IssueModal({ orgId, fy, donor, onClose, onDone }: { orgId: string; fy: string; donor: TaxYear['donors'][number]; onClose: () => void; onDone: () => void }) {
  const [cert, setCert] = useState('');
  const [on, setOn] = useState(todayIn());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/organizations/${orgId}/tax/years/${fy}/form-10be`, { donorKey: donor.donorKey, certificateNumber: cert.trim(), issuedOn: on });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Form 10BE — ${donor.name}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">{donor.donorId} · {fmtMoney(donor.total)} in FY {fy}. Enter the certificate number from the Form 10BE you downloaded from the portal.</p>
        <LabeledInput required label="Certificate number" value={cert} onChange={(e) => setCert(e.target.value)} maxLength={60} />
        <LabeledInput label="Given to the donor on" type="date" value={on} onChange={(e) => setOn(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={cert.trim().length < 4}>Save</Button>
      </form>
    </Modal>
  );
}
