'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Trophy } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { Alert, Button, Checkbox, LabeledInput, LabeledSelect, Skeleton } from '@/components/ui';
import { BookingError, publicApi } from '@/lib/booking';
import { cx } from '@/lib/cx';
import { fmtDateL, fmtHHmmL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { KIND_EMOJI, entryHref, saveEntry, type EntryView, type PublicCompetition } from '@/lib/competition-types';

export default function CompetePage() {
  return (
    <PublicShell>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <EntryForm />
      </Suspense>
    </PublicShell>
  );
}

/** Age in whole years on a calendar day (both YYYY-MM-DD). */
function ageOn(dob: string, on: string) {
  const [y1, m1, d1] = dob.split('-').map(Number);
  const [y2, m2, d2] = on.split('-').map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

function EntryForm() {
  const { competitionId } = useParams<{ competitionId: string }>();
  const wanted = useSearchParams().get('category') ?? '';
  const router = useRouter();
  const { t, locale } = useT();
  const [c, setC] = useState<PublicCompetition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER' | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi.get<PublicCompetition>(`/public/competitions/${competitionId}`)
      .then((r) => {
        setC(r);
        const open = r.categories.filter((x) => !x.full);
        setCategoryId(open.find((x) => x.id === wanted)?.id ?? (open.length === 1 ? open[0].id : ''));
      })
      .catch((e) => setLoadError(e instanceof BookingError ? e.message : String(e)));
  }, [competitionId, wanted]);

  const cat = c?.categories.find((x) => x.id === categoryId) ?? null;
  const age = dob && c ? ageOn(dob, c.date) : null;
  const minor = age !== null && age < 18;
  const fee = Number(cat?.fee ?? 0);
  const total = useMemo(() => (c?.gstOnFees ? Math.round(fee * 118) / 100 : fee), [c, fee]);
  const festivalHref = c ? `/f/${c.event.slug ?? c.event.id}#competitions` : '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!c || !cat) return setError(t('comp.form.chooseCategory'));
    setError(null);
    setBusy(true);
    try {
      const r = await publicApi.post<EntryView & { accessKey: string }>('/public/competitions/entries', {
        categoryId: cat.id, participantName: name, dateOfBirth: dob, gender, phone, email: email || undefined, city: city || undefined,
        guardianName: minor ? guardianName : undefined, guardianPhone: minor ? guardianPhone : undefined, guardianConsent: minor ? guardianConsent : undefined,
        emergencyName, emergencyPhone, acceptDeclaration: accept,
      });
      saveEntry({ id: r.id, k: r.accessKey, name: r.participantName, competition: c.name, at: new Date().toISOString() });
      router.push(entryHref(r.id, r.accessKey));
    } catch (err) {
      setError(err instanceof BookingError ? err.message : String(err));
      setBusy(false);
    }
  }

  if (loadError) return <Alert>{loadError}</Alert>;
  if (!c) return <Skeleton className="h-96" />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link href={festivalHref} className="inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-semibold text-slate-600">
        <ArrowLeft aria-hidden className="h-4 w-4" /> {t('comp.form.back')}
      </Link>
      <div className="rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-700 p-4 text-white shadow-lg">
        <p className="text-sm opacity-90">{c.event.name} · {c.event.organization}</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold"><span aria-hidden>{KIND_EMOJI[c.kind]}</span> {t('comp.form.title', { name: c.name })}</h1>
        <p className="mt-1 text-sm opacity-90">{fmtDateL(c.date, locale)} · {fmtHHmmL(c.startTime, locale)}{c.venue ? ` · ${c.venue}` : ''}</p>
      </div>
      {c.closedReason && <Alert kind="warning">{c.closedReason}</Alert>}

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <LabeledSelect label={t('comp.form.category')} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">{t('comp.form.chooseCategory')}</option>
          {c.categories.map((x) => (
            <option key={x.id} value={x.id} disabled={x.full}>
              {x.name} · {Number(x.fee) > 0 ? `₹${Number(x.fee)}` : t('common.free')}{x.full ? ` · ${t('comp.full')}` : ''}
            </option>
          ))}
        </LabeledSelect>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-bold">{t('comp.form.participant')}</legend>
          <LabeledInput label={t('comp.form.name')} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label={t('comp.form.dob')} type="date" value={dob} onChange={(e) => setDob(e.target.value)} required max={c.date} />
            <LabeledSelect label={t('comp.form.gender')} value={gender} onChange={(e) => setGender(e.target.value as typeof gender)} required>
              <option value="">—</option>
              <option value="FEMALE">{t('comp.form.female')}</option>
              <option value="MALE">{t('comp.form.male')}</option>
              <option value="OTHER">{t('comp.form.other')}</option>
            </LabeledSelect>
          </div>
          {age !== null && age >= 0 && <p className="text-sm text-slate-600">{t('comp.form.ageOnDay', { age })}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label={t('comp.form.phone')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
            <LabeledInput label={t('comp.form.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <LabeledInput label={t('comp.form.city')} value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} />
        </fieldset>

        {minor && (
          <fieldset className="flex flex-col gap-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3">
            <legend className="px-1 font-bold text-amber-900">{t('comp.form.guardian')}</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label={t('comp.form.guardianName')} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} required maxLength={100} />
              <LabeledInput label={t('comp.form.guardianPhone')} type="tel" inputMode="tel" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} required />
            </div>
            <Checkbox label={t('comp.form.guardianConsent')} checked={guardianConsent} onChange={setGuardianConsent} />
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-bold">{t('comp.form.emergency')}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label={t('comp.form.emergencyName')} value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} required minLength={2} maxLength={100} />
            <LabeledInput label={t('comp.form.emergencyPhone')} type="tel" inputMode="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} required />
          </div>
        </fieldset>

        <div className="rounded-xl bg-slate-50 p-3">
          <p className="mb-1 flex items-center gap-1.5 font-bold"><ShieldCheck aria-hidden className="h-5 w-5 text-emerald-600" /> {t('comp.form.rules')}</p>
          {c.rules && <p className="whitespace-pre-line text-sm text-slate-700">{c.rules}</p>}
          {c.safetyDeclaration && <p className="mt-2 whitespace-pre-line rounded-lg bg-white p-2 text-sm font-semibold text-slate-800">{c.safetyDeclaration}</p>}
          <div className="mt-2"><Checkbox label={t('comp.form.accept')} checked={accept} onChange={setAccept} /></div>
        </div>

        {error && <Alert>{error}</Alert>}
        <p className="text-xs text-slate-500">{t('comp.form.feeNote')}</p>
        <Button type="submit" size="lg" loading={busy} disabled={!!c.closedReason || !cat || !accept || (minor && !guardianConsent)} className={cx('w-full')}>
          <Trophy aria-hidden className="h-5 w-5" /> {fee > 0 ? t('comp.form.pay', { amount: total.toFixed(2).replace(/\.00$/, '') }) : t('comp.form.submitFree')}
        </Button>
      </form>
    </div>
  );
}
