'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, MapPin, PartyPopper, Plus, Send, Sparkles, Trash2, UserRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useFestivalTypes } from '@/lib/catalog';
import { fmtMoney } from '@/lib/format';
import type { MandalRegistration } from '@/lib/registration-types';
import { FestivalBadge } from '../FestivalBanner';
import { FestivalTypeSelect, StateCityPicker } from '../PlacePicker';
import { Alert, Button, Field, LabeledInput, LabeledSelect, Textarea, cx } from '../ui';
import { Declaration } from './Declaration';

export type RegistrationMode = 'self' | 'user' | 'agent' | 'edit';

interface EventRow {
  key: number;
  custom: boolean;
  festivalType: string;
  customName: string;
  customGroup: string;
  customDescription: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  venueAddress: string;
}

let rowSeq = 0;
const blankRow = (): EventRow => ({
  key: ++rowSeq, custom: false, festivalType: '', customName: '', customGroup: '', customDescription: '', name: '', startDate: '', endDate: '', location: '', venueAddress: '',
});

export interface RegistrationSubmitted {
  /** self mode: email to verify. */
  email?: string;
  registration?: MandalRegistration;
}

/**
 * Mandal registration form, shared by the public sign-up (self), a logged-in
 * user, a field agent filing for a mandal, and fixing a registration the
 * platform sent back. The server validates everything again (types, dates,
 * declaration, referral code) — this only helps the person get it right.
 */
export function MandalRegistrationForm({
  mode,
  initial,
  referralCode,
  onSubmitted,
}: {
  mode: RegistrationMode;
  initial?: MandalRegistration | null;
  referralCode?: string;
  onSubmitted: (r: RegistrationSubmitted) => void;
}) {
  const types = useFestivalTypes();
  const groups = [...new Set((types.data ?? []).map((t) => t.group))];
  const [form, setForm] = useState({
    orgName: initial?.orgName ?? '', state: initial?.state ?? '', city: initial?.city ?? '', address: initial?.address ?? '',
    contactName: '', mobile: '', email: '', password: '', referralCode: referralCode ?? '',
  });
  const [rows, setRows] = useState<EventRow[]>(() =>
    initial?.requestedEvents.length
      ? initial.requestedEvents.map((e) => ({
        ...blankRow(), custom: !!e.custom, festivalType: e.festivalType ?? '', customName: e.custom?.name ?? '', customGroup: e.custom?.group ?? '',
        customDescription: e.custom?.description ?? '', name: e.name, startDate: e.startDate, endDate: e.endDate, location: e.location ?? '', venueAddress: e.venueAddress ?? '',
      }))
      : [blankRow()],
  );
  const [declared, setDeclared] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<{ valid: boolean; agentName?: string } | null>(null);
  const showContact = mode === 'self' || mode === 'agent';
  const showReferral = mode === 'self' || mode === 'user';

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (key: number, patch: Partial<EventRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Show whose referral code it is (and catch typos) before submitting.
  useEffect(() => {
    const code = form.referralCode.trim();
    if (!showReferral || code.length < 4) return setRef(null);
    const t = setTimeout(() => {
      api.get<{ valid: boolean; agentName?: string }>(`/public/referral/${encodeURIComponent(code)}`, undefined, { noAuthRedirect: true }).then(setRef).catch(() => setRef(null));
    }, 400);
    return () => clearTimeout(t);
  }, [form.referralCode, showReferral]);

  function validate() {
    const errs: Record<string, string> = {};
    if (form.orgName.trim().length < 2) errs.orgName = 'Enter the mandal / organisation name.';
    if (showContact) {
      if (form.contactName.trim().length < 2) errs.contactName = 'Enter the contact person’s name.';
      if (form.mobile.replace(/\D/g, '').length < 10) errs.mobile = 'Enter a valid 10-digit mobile number.';
      if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = mode === 'agent' ? 'Enter the mandal contact’s email — they get a link to set their password.' : 'Enter a valid email — we send a code to it.';
    }
    if (mode === 'self' && form.password.length < 8) errs.password = 'At least 8 characters.';
    rows.forEach((r, i) => {
      if (r.custom ? r.customName.trim().length < 2 || !r.customGroup : !r.festivalType) errs[`ev${i}`] = r.custom ? 'Give your event a name and a category.' : 'Choose a festival from the list.';
      else if (r.name.trim().length < 2) errs[`ev${i}`] = 'Enter a name for this festival, e.g. “Ganeshotsav 2026”.';
      else if (!r.startDate || !r.endDate) errs[`ev${i}`] = 'Choose the start and end dates.';
      else if (r.endDate < r.startDate) errs[`ev${i}`] = 'The end date cannot be before the start date.';
    });
    if (!declared) errs.declaration = 'Please tick the declaration to continue.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return setError('Please fix the highlighted fields.');
    const events = rows.map((r) => ({
      ...(r.custom ? { custom: { name: r.customName.trim(), group: r.customGroup, description: r.customDescription.trim() || undefined } } : { festivalType: r.festivalType }),
      name: r.name.trim(), startDate: r.startDate, endDate: r.endDate, location: r.location.trim() || undefined, venueAddress: r.venueAddress.trim() || undefined,
    }));
    const base = { orgName: form.orgName.trim(), state: form.state || undefined, city: form.city.trim() || undefined, address: form.address.trim() || undefined, events, declarationAccepted: declared };
    const contact = { contactName: form.contactName.trim(), mobile: form.mobile.trim(), email: form.email.trim() };
    const referral = form.referralCode.trim() ? { referralCode: form.referralCode.trim() } : {};
    setBusy(true);
    try {
      if (mode === 'self') {
        const r = await api.post<{ email: string }>('/public/mandal-registrations', { ...base, ...contact, password: form.password, ...referral }, { noAuthRedirect: true });
        onSubmitted({ email: r.email });
      } else if (mode === 'user') {
        onSubmitted({ registration: await api.post<MandalRegistration>('/me/mandal-registrations', { ...base, ...referral }) });
      } else if (mode === 'agent') {
        onSubmitted({ registration: await api.post<MandalRegistration>('/agent/mandal-registrations', { ...base, ...contact }) });
      } else {
        onSubmitted({ registration: await api.patch<MandalRegistration>(`/me/mandal-registrations/${initial!.id}`, base) });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <Section icon={PartyPopper} title="Your mandal / organisation" tone="from-amber-400 to-orange-500">
        <LabeledInput label="Organisation name" value={form.orgName} onChange={set('orgName')} error={errors.orgName} placeholder="e.g. Shiv Shakti Mitra Mandal" maxLength={150} />
        <StateCityPicker state={form.state} city={form.city} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
        <Field label="Address (optional)">
          <Textarea value={form.address} onChange={set('address')} maxLength={500} placeholder="Area, landmark, PIN" className="min-h-[72px]" />
        </Field>
      </Section>

      {showContact && (
        <Section icon={UserRound} title={mode === 'agent' ? 'Mandal contact person' : 'Contact person (you)'} tone="from-sky-400 to-blue-600">
          <LabeledInput label="Name" autoComplete={mode === 'self' ? 'name' : 'off'} value={form.contactName} onChange={set('contactName')} error={errors.contactName} maxLength={100} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <LabeledInput label="Mobile number" type="tel" inputMode="numeric" autoComplete={mode === 'self' ? 'tel' : 'off'} value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="9876543210" />
            <LabeledInput label="Email" type="email" autoCapitalize="none" autoComplete={mode === 'self' ? 'email' : 'off'} value={form.email} onChange={set('email')} error={errors.email}
              hint={mode === 'agent' ? 'They get a link to set their password.' : 'We send a 6-digit code to verify it.'} />
          </div>
          {mode === 'self' && <LabeledInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />}
        </Section>
      )}

      <Section icon={Sparkles} title="Festivals & events you want to run" tone="from-fuchsia-500 to-rose-500">
        <p className="-mt-1 text-sm text-slate-600">Each festival is reviewed and paid for separately. Pick it from the list, or choose “My event isn’t listed”.</p>
        {rows.map((r, i) => (
          <EventCard
            key={r.key}
            row={r}
            index={i}
            groups={groups}
            error={errors[`ev${i}`]}
            canRemove={rows.length > 1}
            onChange={(p) => setRow(r.key, p)}
            onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
          />
        ))}
        {rows.length < 10 && (
          <Button variant="secondary" onClick={() => setRows((rs) => [...rs, blankRow()])}>
            <Plus aria-hidden className="h-4 w-4" /> Add another festival
          </Button>
        )}
      </Section>

      {showReferral && (
        <div className="flex flex-col gap-1">
          <LabeledInput label="Agent referral code (optional)" value={form.referralCode} onChange={(e) => setForm((f) => ({ ...f, referralCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} maxLength={20} placeholder="e.g. RAKESH30" autoCapitalize="characters" />
          {ref && (ref.valid
            ? <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 aria-hidden className="h-4 w-4" /> Referred by {ref.agentName}</p>
            : <p className="text-sm text-red-700">We don’t recognise this code.</p>)}
        </div>
      )}

      <Declaration checked={declared} onChange={setDeclared} error={errors.declaration} onBehalf={mode === 'agent'} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        {!busy && <Send aria-hidden className="h-5 w-5" />}
        {mode === 'edit' ? 'Resubmit for review' : mode === 'agent' ? 'Register this mandal' : 'Submit for review'}
      </Button>
      <p className="text-center text-xs text-slate-500">Nothing is published until the Parvsetu team verifies your mandal and each festival’s registration fee is paid.</p>
    </form>
  );
}

function Section({ icon: Icon, title, tone, children }: { icon: typeof Sparkles; title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm', tone)}>
          <Icon aria-hidden className="h-4 w-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function EventCard({ row, index, groups, error, canRemove, onChange, onRemove }: {
  row: EventRow; index: number; groups: string[]; error?: string; canRemove: boolean; onChange: (p: Partial<EventRow>) => void; onRemove: () => void;
}) {
  const types = useFestivalTypes();
  const def = types.data?.find((t) => t.key === row.festivalType);
  const [quote, setQuote] = useState<string | null>(null);
  useEffect(() => {
    if (row.custom || !row.festivalType) return setQuote(null);
    let alive = true;
    api.get<{ fee: string }>('/public/event-fee-quote', { festivalType: row.festivalType }, { noAuthRedirect: true }).then((q) => alive && setQuote(q.fee)).catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
  }, [row.custom, row.festivalType]);

  function pickType(key: string) {
    const t = types.data?.find((x) => x.key === key);
    // Auto-fill the name from the catalog entry the first time a type is picked.
    const year = new Date().getFullYear();
    onChange({ festivalType: key, name: !row.name.trim() && t ? `${t.label.split(' / ')[0]} ${year}` : row.name });
  }

  return (
    <div className={cx('flex flex-col gap-3 rounded-2xl border bg-white p-3 shadow-sm sm:p-4', error ? 'border-red-300' : 'border-orange-100')}>
      <div className="flex items-center gap-3">
        <FestivalBadge type={row.custom ? null : row.festivalType || null} className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Festival {index + 1}</p>
          <p className="truncate font-semibold text-slate-900">{row.name || (row.custom ? row.customName : def?.label) || 'Not chosen yet'}</p>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove} aria-label={`Remove festival ${index + 1}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-600">
            <Trash2 aria-hidden className="h-5 w-5" />
          </button>
        )}
      </div>
      <div role="radiogroup" aria-label="Festival source" className="grid grid-cols-2 gap-2">
        {[{ v: false, label: 'From the list' }, { v: true, label: 'My event isn’t listed' }].map((o) => (
          <button
            key={String(o.v)}
            type="button"
            role="radio"
            aria-checked={row.custom === o.v}
            onClick={() => onChange({ custom: o.v })}
            className={cx('min-h-[44px] rounded-xl px-2 text-sm font-semibold transition', row.custom === o.v ? 'bg-orange-500 text-white shadow-sm' : 'bg-orange-50 text-orange-900 ring-1 ring-orange-200')}
          >
            {o.label}
          </button>
        ))}
      </div>
      {row.custom ? (
        <div className="flex flex-col gap-3 rounded-xl bg-violet-50/60 p-3 ring-1 ring-violet-200">
          <p className="text-xs text-violet-900">Tell us about it — the Parvsetu team reviews new event types before they go live, and may add yours to the list for everyone.</p>
          <LabeledInput label="Event type name" value={row.customName} onChange={(e) => onChange({ customName: e.target.value })} placeholder="e.g. Tanha Pola" maxLength={80} />
          <LabeledSelect label="Category" value={row.customGroup} onChange={(e) => onChange({ customGroup: e.target.value })}>
            <option value="">— Choose a category —</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </LabeledSelect>
          <Field label="Short description">
            <Textarea value={row.customDescription} onChange={(e) => onChange({ customDescription: e.target.value })} maxLength={1000} placeholder="What happens at this event?" className="min-h-[72px]" />
          </Field>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <FestivalTypeSelect value={row.festivalType} onChange={pickType} label="Festival" />
          {def && (
            <p className="text-xs text-slate-500">
              {def.group}{def.months ? ` · usually ${def.months}` : ''} · pass codes start with <span className="font-mono font-semibold">{def.defaultPrefix}</span>
              {quote && <> · registration fee <span className="font-semibold text-orange-700">{fmtMoney(quote)}</span></>}
            </p>
          )}
        </div>
      )}
      <LabeledInput label="Name for this edition" value={row.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. Shiv Shakti Ganeshotsav 2026" maxLength={150} />
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Start date" type="date" value={row.startDate} onChange={(e) => onChange({ startDate: e.target.value })} />
        <LabeledInput label="End date" type="date" value={row.endDate} min={row.startDate || undefined} onChange={(e) => onChange({ endDate: e.target.value })} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LabeledInput label="Venue / pandal (optional)" value={row.location} onChange={(e) => onChange({ location: e.target.value })} maxLength={300} placeholder="e.g. Itwari chowk pandal" />
        <LabeledInput label="Venue address (optional)" value={row.venueAddress} onChange={(e) => onChange({ venueAddress: e.target.value })} maxLength={500} />
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-3.5 w-3.5" /> Slots, prices and volunteers can be set up after approval</span>
        <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5" /> Full venue details later</span>
      </p>
      {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
