'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertOctagon,
  ArrowDownToLine,
  BadgeCheck,
  Building,
  FileText,
  Hourglass,
  Landmark,
  Pencil,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { BankAccountType, PayoutAccount, PayoutAccountInput, PayoutEntityType, RegisteredType } from '@/lib/types';
import { StateCityPicker } from '../PlacePicker';
import { PayoutsList, REGISTERED_TYPE_LABEL, SettlementsList, SettlementTotalsGrid, proofToDataUrl, usePayouts, useSettlements } from '../payouts/PayoutParts';
import { Alert, Button, Card, Checkbox, Empty, LabeledInput, LabeledSelect, SectionTitle, SkeletonList, cx } from '../ui';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PIN_RE = /^[1-9]\d{5}$/;
const MOBILE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PayoutsTab() {
  const org = useOrg();
  const acct = useAsync(() => api.get<PayoutAccount | null>(`/organizations/${org.orgId}/payout-account`), [org.orgId]);
  const canEdit = can(org.perms, 'SETTINGS_UPDATE');
  const canMoney = can(org.perms, 'DONATION_VIEW');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const a = acct.data;

  function startEdit() {
    if (a?.status === 'VERIFIED' && !window.confirm('Changing your payout details sends them back for review. Online pass payments pause until the new details are verified. Continue?')) return;
    setSaved(false);
    setEditing(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {acct.error && <Alert>{acct.error}</Alert>}
      {acct.loading && !acct.data ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          <StatusCard account={a ?? null} />
          {saved && !editing && <Alert kind="success">Details submitted. We&apos;ll review them shortly — you&apos;ll see the status here.</Alert>}
          {editing || !a ? (
            canEdit ? (
              <PayoutForm
                account={a ?? null}
                onCancel={a ? () => setEditing(false) : undefined}
                onSaved={(next) => {
                  acct.setData(next);
                  setEditing(false);
                  setSaved(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : (
              <Empty icon={Landmark} title="No payout account yet">
                Ask a mandal admin with settings rights to add the bank account.
              </Empty>
            )
          ) : (
            <AccountDetails account={a} action={canEdit ? <Button variant="secondary" onClick={startEdit}><Pencil aria-hidden className="h-4 w-4" /> Update details</Button> : null} />
          )}
        </>
      )}
      {canMoney && <MoneySection />}
    </div>
  );
}

function StatusCard({ account }: { account: PayoutAccount | null }) {
  if (!account) {
    return (
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-5 text-white shadow-lg">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
            <Landmark aria-hidden className="h-8 w-8" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Payout account</p>
            <h2 className="text-2xl font-black">Add your bank account</h2>
            <p className="mt-1 text-sm text-white/95">
              Online pass payments are split: the platform commission is kept and the rest is paid to this account. Until it is verified, visitors can
              only book free passes online.
            </p>
          </div>
        </div>
      </section>
    );
  }
  const s = account.status;
  const tone =
    s === 'VERIFIED' ? 'from-emerald-500 to-teal-700' : s === 'PENDING' ? 'from-amber-500 to-orange-600' : 'from-rose-500 to-red-700';
  const Icon = s === 'VERIFIED' ? BadgeCheck : s === 'PENDING' ? Hourglass : AlertOctagon;
  const title =
    s === 'VERIFIED' ? 'Verified — online payments are on' : s === 'PENDING' ? 'Under review' : s === 'NEEDS_CORRECTION' ? 'Needs correction' : 'Rejected';
  const body =
    s === 'VERIFIED'
      ? 'Visitors can pay for passes online. Your share is paid to the account below.'
      : s === 'PENDING'
        ? 'We are checking your details. Paid online bookings stay off until the account is verified.'
        : 'Paid online bookings are off. Fix the details below and submit again.';
  return (
    <section className={cx('relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-lg', tone)} role="status">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
          <Icon aria-hidden className="h-8 w-8" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Payout account</p>
          <h2 className="text-2xl font-black leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-white/95">{body}</p>
          {account.reviewNote && (s === 'NEEDS_CORRECTION' || s === 'REJECTED') && (
            <p className="mt-3 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-red-900">Reviewer&apos;s note: {account.reviewNote}</p>
          )}
          <p className="mt-2 text-xs text-white/80">
            Submitted {fmtDateTime(account.submittedAt)}
            {account.reviewedAt ? ` · reviewed ${fmtDateTime(account.reviewedAt)}` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-orange-50/40 px-3 py-2 ring-1 ring-orange-100">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={cx('break-words font-semibold text-slate-900', mono && 'font-mono')}>{value || '—'}</dd>
    </div>
  );
}

function AccountDetails({ account: a, action }: { account: PayoutAccount; action: ReactNode }) {
  const reg = a.entityType === 'REGISTERED';
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
            {reg ? <Building aria-hidden className="h-5 w-5" /> : <Users aria-hidden className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-lg font-bold">{a.legalName}</p>
            <p className="text-sm text-slate-600">{reg ? REGISTERED_TYPE_LABEL[a.registeredType ?? 'OTHER'] : 'Unregistered mandal'}</p>
          </div>
        </div>
        {action}
      </div>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {reg && <Row label="Registration no." value={a.registrationNumber} />}
        {reg && <Row label="Organisation PAN" value={a.orgPan} mono />}
        {reg && a.gstin && <Row label="GSTIN" value={a.gstin} mono />}
        {reg && <Row label="80G number" value={a.reg80G} />}
        {reg && <Row label="12A number" value={a.reg12A} />}
        <Row label="Authorised signatory PAN" value={a.signatoryPan} mono />
        <Row label="Address" value={`${a.addressLine}, ${a.city}, ${a.state} ${a.pincode}`} />
        <Row label="Contact" value={`${a.contactName} (${a.contactRole}) · ${a.contactPhone}`} />
        <Row label="Email" value={a.contactEmail} />
      </dl>
      <div className="rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-900">
          <Landmark aria-hidden className="h-4 w-4" /> Bank account
        </p>
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Row label="Holder" value={a.bankHolderName} />
          <Row label="Account no." value={a.bankAccount} mono />
          <Row label="IFSC" value={a.ifsc} mono />
          <Row label="Type" value={a.accountType === 'CURRENT' ? 'Current' : 'Savings'} />
        </dl>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" /> Stored encrypted. Only the last 4 digits are ever shown. {a.hasProof ? 'Proof uploaded.' : 'No proof uploaded.'}
        </p>
      </div>
    </Card>
  );
}

interface FormState {
  entityType: PayoutEntityType;
  registeredType: RegisteredType | '';
  legalName: string;
  registrationNumber: string;
  orgPan: string;
  gstin: string;
  reg80G: string;
  reg12A: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  signatoryPan: string;
  bankHolderName: string;
  bankAccount: string;
  bankAccount2: string;
  ifsc: string;
  accountType: BankAccountType;
  consent: boolean;
}

type Errors = Partial<Record<keyof FormState | 'proof', string>>;

function initial(a: PayoutAccount | null): FormState {
  return {
    entityType: a?.entityType ?? 'REGISTERED',
    registeredType: a?.registeredType ?? '',
    legalName: a?.legalName ?? '',
    registrationNumber: a?.registrationNumber ?? '',
    orgPan: '',
    gstin: a?.gstin ?? '',
    reg80G: a?.reg80G ?? '',
    reg12A: a?.reg12A ?? '',
    addressLine: a?.addressLine ?? '',
    city: a?.city ?? '',
    state: a?.state ?? '',
    pincode: a?.pincode ?? '',
    contactName: a?.contactName ?? '',
    contactRole: a?.contactRole ?? '',
    contactPhone: a?.contactPhone ?? '',
    contactEmail: a?.contactEmail ?? '',
    signatoryPan: '',
    bankHolderName: a?.bankHolderName ?? '',
    bankAccount: '',
    bankAccount2: '',
    ifsc: a?.ifsc ?? '',
    accountType: a?.accountType ?? 'SAVINGS',
    consent: false,
  };
}

function validate(f: FormState): Errors {
  const e: Errors = {};
  const reg = f.entityType === 'REGISTERED';
  if (reg && !f.registeredType) e.registeredType = 'Choose the type of registration.';
  if (f.legalName.trim().length < 3) e.legalName = reg ? 'Enter the name exactly as registered.' : 'Enter the mandal name.';
  if (reg && f.registrationNumber.trim().length < 2) e.registrationNumber = 'Enter the registration number.';
  if (reg && !PAN_RE.test(f.orgPan)) e.orgPan = 'PAN looks like AAATS1234Z (5 letters, 4 digits, 1 letter).';
  if (reg && f.gstin && !GSTIN_RE.test(f.gstin)) e.gstin = 'GSTIN is 15 characters, e.g. 19AAATS1234Z1Z5.';
  if (f.addressLine.trim().length < 5) e.addressLine = 'Enter the full address.';
  if (!f.state) e.state = 'Choose the state.';
  else if (f.city.trim().length < 2) e.city = 'Choose or type the city.';
  if (!PIN_RE.test(f.pincode)) e.pincode = 'PIN code is 6 digits.';
  if (f.contactName.trim().length < 2) e.contactName = 'Enter the contact person’s name.';
  if (f.contactRole.trim().length < 2) e.contactRole = 'E.g. Secretary, Treasurer.';
  if (!MOBILE_RE.test(f.contactPhone)) e.contactPhone = '10-digit mobile number starting with 6–9.';
  if (!EMAIL_RE.test(f.contactEmail.trim())) e.contactEmail = 'Enter a valid email.';
  if (!PAN_RE.test(f.signatoryPan)) e.signatoryPan = 'PAN looks like ABCDE1234F.';
  if (f.bankHolderName.trim().length < 3) e.bankHolderName = 'Enter the account holder name.';
  if (!/^\d{9,18}$/.test(f.bankAccount)) e.bankAccount = 'Account number is 9–18 digits.';
  else if (f.bankAccount !== f.bankAccount2) e.bankAccount2 = 'The two account numbers don’t match.';
  if (!IFSC_RE.test(f.ifsc)) e.ifsc = 'IFSC looks like SBIN0001234 (11 characters, 5th is zero).';
  if (!f.consent) e.consent = 'Please confirm you are authorised to add this account.';
  return e;
}

const upper = (v: string) => v.toUpperCase().replace(/\s+/g, '');

function PayoutForm({ account, onCancel, onSaved }: { account: PayoutAccount | null; onCancel?: () => void; onSaved: (a: PayoutAccount) => void }) {
  const org = useOrg();
  const [f, setF] = useState<FormState>(() => initial(account));
  const [errors, setErrors] = useState<Errors>({});
  const [proof, setProof] = useState<{ dataUrl: string; name: string; pdf: boolean } | null>(null);
  const [proofBusy, setProofBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reg = f.entityType === 'REGISTERED';

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  }
  const text = (k: keyof FormState, map?: (v: string) => string) => ({
    value: f[k] as string,
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, (map ? map(e.target.value) : e.target.value) as FormState[typeof k]),
  });

  async function pick(file: File | undefined) {
    if (!file) return;
    setErrors((x) => ({ ...x, proof: undefined }));
    setProofBusy(true);
    try {
      setProof({ dataUrl: await proofToDataUrl(file), name: file.name, pdf: file.type === 'application/pdf' });
    } catch (e) {
      setErrors((x) => ({ ...x, proof: errorMessage(e) }));
    } finally {
      setProofBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = validate(f);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      setError('Please fix the highlighted fields.');
      // Bring the first problem into view (errors render on the next paint).
      requestAnimationFrame(() => document.querySelector('[data-payout-form] .text-red-700')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    const body: PayoutAccountInput = {
      entityType: f.entityType,
      legalName: f.legalName.trim(),
      addressLine: f.addressLine.trim(),
      city: f.city.trim(),
      state: f.state,
      pincode: f.pincode,
      contactName: f.contactName.trim(),
      contactRole: f.contactRole.trim(),
      contactPhone: f.contactPhone,
      contactEmail: f.contactEmail.trim(),
      signatoryPan: f.signatoryPan,
      bankHolderName: f.bankHolderName.trim(),
      bankAccount: f.bankAccount,
      ifsc: f.ifsc,
      accountType: f.accountType,
      consent: true,
      ...(reg
        ? {
            registeredType: f.registeredType || undefined,
            registrationNumber: f.registrationNumber.trim(),
            orgPan: f.orgPan,
            ...(f.gstin ? { gstin: f.gstin } : {}),
            ...(f.reg80G.trim() ? { reg80G: f.reg80G.trim() } : {}),
            ...(f.reg12A.trim() ? { reg12A: f.reg12A.trim() } : {}),
          }
        : {}),
      ...(proof ? { proofDataUrl: proof.dataUrl } : {}),
    };
    setBusy(true);
    try {
      onSaved(await api.put<PayoutAccount>(`/organizations/${org.orgId}/payout-account`, body));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate data-payout-form className="flex flex-col gap-4">
      {account && (
        <Alert kind="warning">
          Changing these details sends them back to review, and paid online bookings pause until they are verified again. For your security, re-enter the
          PAN(s) and the full account number.
        </Alert>
      )}

      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Building}>Who is receiving the money?</SectionTitle>
        <div role="radiogroup" aria-label="Mandal type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { key: 'REGISTERED', icon: Building, title: 'Registered', sub: 'Trust / Society / Section 8 / Partnership / Proprietorship' },
              { key: 'UNREGISTERED', icon: Users, title: 'Unregistered mandal', sub: 'A committee of people, no legal registration' },
            ] as const
          ).map((o) => {
            const on = f.entityType === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set('entityType', o.key)}
                className={cx(
                  'flex min-h-[72px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all',
                  on ? 'border-orange-500 bg-gradient-to-br from-amber-50 to-rose-50 shadow-md shadow-orange-500/10' : 'border-orange-100 bg-white hover:border-orange-300',
                )}
              >
                <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', on ? 'bg-gradient-to-br from-amber-500 to-rose-500 text-white' : 'bg-orange-50 text-orange-500')}>
                  <o.icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-slate-900">{o.title}</span>
                  <span className="block text-xs text-slate-600">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {reg ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <LabeledSelect label="Type of registration" value={f.registeredType} onChange={(e) => set('registeredType', e.target.value as RegisteredType | '')}>
                <option value="">— Choose —</option>
                {(Object.keys(REGISTERED_TYPE_LABEL) as RegisteredType[]).map((k) => (
                  <option key={k} value={k}>{REGISTERED_TYPE_LABEL[k]}</option>
                ))}
              </LabeledSelect>
              {errors.registeredType && <p className="text-sm text-red-700">{errors.registeredType}</p>}
            </div>
            <LabeledInput label="Legal name (as registered)" maxLength={150} {...text('legalName')} />
            <LabeledInput label="Registration number" maxLength={60} {...text('registrationNumber')} />
            <LabeledInput label="Organisation PAN" placeholder="AAATS1234Z" maxLength={10} autoCapitalize="characters" autoComplete="off" {...text('orgPan', upper)} />
            <LabeledInput label="GSTIN (optional)" placeholder="19AAATS1234Z1Z5" maxLength={15} autoCapitalize="characters" {...text('gstin', upper)} />
            <LabeledInput label="80G registration no. (optional)" maxLength={60} hint="Printed on donation receipts" {...text('reg80G')} />
            <LabeledInput label="12A registration no. (optional)" maxLength={60} {...text('reg12A')} />
          </div>
        ) : (
          <>
            <Alert kind="info">Use the authorised committee member&apos;s PAN and an account in their (or a joint) name.</Alert>
            <LabeledInput label="Mandal name" maxLength={150} {...text('legalName')} />
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Users}>Address &amp; contact</SectionTitle>
        <LabeledInput label="Address" maxLength={300} placeholder="Building, street, area" {...text('addressLine')} />
        <StateCityPicker required state={f.state} city={f.city} onChange={(p) => { set('state', p.state); set('city', p.city); }} />
        {(errors.state || errors.city) && <p className="-mt-2 text-sm text-red-700">{errors.state ?? errors.city}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label="PIN code" inputMode="numeric" maxLength={6} {...text('pincode', (v) => v.replace(/\D/g, ''))} />
          <LabeledInput label="Contact person" maxLength={100} {...text('contactName')} />
          <LabeledInput label="Their role" placeholder="Secretary / Treasurer" maxLength={60} {...text('contactRole')} />
          <LabeledInput label="Mobile" type="tel" inputMode="numeric" maxLength={10} placeholder="98XXXXXXXX" {...text('contactPhone', (v) => v.replace(/\D/g, ''))} />
          <LabeledInput label="Email" type="email" maxLength={150} {...text('contactEmail')} />
          <LabeledInput
            label="Authorised signatory PAN"
            placeholder="ABCDE1234F"
            maxLength={10}
            autoCapitalize="characters"
            autoComplete="off"
            hint={reg ? 'PAN of the trustee / secretary who signs' : 'PAN of the committee member who holds the account'}
            {...text('signatoryPan', upper)}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <SectionTitle icon={Landmark}>Bank account</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <LabeledInput label="Account holder name" maxLength={150} hint="Must match the PAN name exactly, as printed on the cheque." {...text('bankHolderName')} />
          </div>
          <LabeledInput label="Account number" inputMode="numeric" autoComplete="off" maxLength={18} {...text('bankAccount', (v) => v.replace(/\D/g, ''))} />
          <LabeledInput
            label="Re-enter account number"
            inputMode="numeric"
            autoComplete="off"
            maxLength={18}
            onPaste={(e) => e.preventDefault()}
            hint={f.bankAccount2 && f.bankAccount2 === f.bankAccount ? '✓ Matches' : 'Type it again (paste is off)'}
            {...text('bankAccount2', (v) => v.replace(/\D/g, ''))}
          />
          <LabeledInput label="IFSC" placeholder="SBIN0001234" maxLength={11} autoCapitalize="characters" hint="11 characters — on your cheque book" {...text('ifsc', upper)} />
          <LabeledSelect label="Account type" value={f.accountType} onChange={(e) => set('accountType', e.target.value as BankAccountType)}>
            <option value="SAVINGS">Savings</option>
            <option value="CURRENT">Current</option>
          </LabeledSelect>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 p-3">
          <p className="text-sm font-semibold text-slate-800">Proof of account {account?.hasProof ? '(already uploaded — add a new one only if the account changed)' : '(recommended)'}</p>
          <p className="text-xs text-slate-500">A photo of a cancelled cheque or the passbook front page. JPG/PNG photo, or a PDF up to 2 MB.</p>
          {proof ? (
            <div className="flex items-center gap-3 rounded-xl bg-white p-2 ring-1 ring-orange-100">
              {proof.pdf ? (
                <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-rose-50 text-rose-600"><FileText aria-hidden className="h-8 w-8" /></span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proof.dataUrl} alt="Proof preview" className="h-16 w-24 rounded-lg object-cover ring-1 ring-orange-100" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{proof.name}</span>
              <Button variant="ghost" size="sm" aria-label="Remove proof" onClick={() => setProof(null)}>
                <X aria-hidden className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="secondary" loading={proofBusy} onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden className="h-4 w-4" /> Upload cheque / passbook
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          {errors.proof && <p className="text-sm text-red-700">{errors.proof}</p>}
        </div>
      </Card>

      <Card className="flex flex-col gap-2">
        <Checkbox
          checked={f.consent}
          onChange={(v) => set('consent', v)}
          label={
            <span className="text-sm">
              I am authorised by {reg ? 'the organisation' : 'the mandal committee'} to add this bank account, and the details above are correct. I agree that online
              payments for this mandal are paid into it, after the platform commission and gateway fees.
            </span>
          }
        />
        {errors.consent && <p className="text-sm text-red-700">{errors.consent}</p>}
      </Card>

      {error && <Alert>{error}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="lg" loading={busy}>
          <ShieldCheck aria-hidden className="h-5 w-5" /> Submit for verification
        </Button>
      </div>
    </form>
  );
}

function MoneySection() {
  const org = useOrg();
  const [status, setStatus] = useState('');
  const settlements = useSettlements(`/organizations/${org.orgId}/settlements`, { status: status || undefined });
  const payouts = usePayouts(`/organizations/${org.orgId}/payouts`);
  return (
    <>
      <SectionTitle icon={ArrowDownToLine}>Online payments &amp; settlements</SectionTitle>
      {settlements.error && <Alert>{settlements.error}</Alert>}
      {settlements.data && <SettlementTotalsGrid totals={settlements.data.totals} />}
      <div className="sm:w-60">
        <LabeledSelect label="Show" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All settlements</option>
          <option value="PENDING_PAYOUT">Pending payout</option>
          <option value="PAID_OUT">Paid out</option>
        </LabeledSelect>
      </div>
      <SettlementsList q={settlements} emptyText="Every paid online pass appears here, split into commission, gateway fee and your share." />

      <SectionTitle icon={Landmark}>Payouts to your bank</SectionTitle>
      {payouts.error && <Alert>{payouts.error}</Alert>}
      <PayoutsList q={payouts} emptyText="When your share is transferred, the bank reference (UTR) shows here." />
    </>
  );
}
