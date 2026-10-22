'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, HandCoins, HandHeart, HeartHandshake, RotateCcw, ShieldCheck } from 'lucide-react';
import { FestivalBanner } from '@/components/FestivalBanner';
import { PublicShell } from '@/components/booking/PublicShell';
import { Alert, Button, Checkbox, Empty, LabeledInput, LabeledSelect, Skeleton, cx } from '@/components/ui';
import { festivalTheme } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { fmtRangeL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';
import { BookingError, normalizeIndianMobile } from '@/lib/booking';
import { donate, donationPayHref, type DonateEventInfo } from '@/lib/donate';
import { DONOR_ID_TYPES } from '@/lib/tax-types';

type Errors = Partial<Record<'amount' | 'name' | 'mobile' | 'email' | 'idNumber', string>>;

export default function DonatePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const { t, locale } = useT();
  const errText = useBookingErrorText();

  const [info, setInfo] = useState<DonateEventInfo | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [reload, setReload] = useState(0);

  const [amount, setAmount] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [want80G, setWant80G] = useState(false);
  const [idType, setIdType] = useState('PAN');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    let live = true;
    setLoadError(null);
    donate.event(eventId).then(
      (i) => live && setInfo(i),
      (e) => live && setLoadError(e instanceof BookingError ? e : new BookingError(0, String(e))),
    );
    return () => {
      live = false;
    };
  }, [eventId, reload]);

  const back = `/f/${eventId}`;

  if (loadError) {
    return (
      <PublicShell>
        <div className="flex flex-col gap-4 pt-4">
          {loadError.status === 404 ? (
            <Empty title={t('donate.closed')} icon={HandHeart}>
              {t('donate.closedHint')}
              <div className="mt-4">
                <Link href="/" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-orange-600 px-4 font-semibold text-white">
                  <ArrowLeft aria-hidden className="h-5 w-5" /> {t('common.browseFestivals')}
                </Link>
              </div>
            </Empty>
          ) : (
            <Alert>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{errText(loadError)}</span>
                <Button size="sm" variant="secondary" onClick={() => setReload((n) => n + 1)}>
                  <RotateCcw aria-hidden className="h-4 w-4" /> {t('common.retry')}
                </Button>
              </div>
            </Alert>
          )}
        </div>
      </PublicShell>
    );
  }

  if (!info) {
    return (
      <PublicShell>
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('donate.loading')}>
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </PublicShell>
    );
  }

  const theme = festivalTheme(info.festivalType);
  const min = Number(info.minAmount);
  const max = Number(info.maxAmount);
  const amountNum = Number(amount);
  const amountOk = /^\d{1,7}(\.\d{1,2})?$/.test(amount.trim()) && amountNum >= min && amountNum <= max;
  const offer80G = !!info.deduction80G && !anonymous;

  function clear(k: keyof Errors) {
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  }

  function validate() {
    const e: Errors = {};
    if (!amountOk) e.amount = t('donate.v.amount', { min: min.toLocaleString('en-IN'), max: max.toLocaleString('en-IN') });
    const n = name.trim();
    if (!anonymous && n.length < 2) e.name = t('donate.v.name');
    const m = mobile.trim() ? normalizeIndianMobile(mobile) : null;
    if (mobile.trim() && !m) e.mobile = t('book.v.mobileInvalid');
    const em = email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = t('book.v.email');
    if (offer80G && want80G && idNumber.trim().length < 4) e.idNumber = t('donate.v.id');
    setErrors(e);
    return { ok: Object.keys(e).length === 0, mobile: m };
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    if (submitLock.current || !info) return;
    setSubmitError(null);
    const v = validate();
    if (!v.ok) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const d = await donate.create({
        eventId: info.id,
        amount: amount.trim(),
        ...(anonymous ? { isAnonymous: true } : { donorName: name.trim() }),
        ...(v.mobile ? { donorMobile: v.mobile } : {}),
        ...(email.trim() ? { donorEmail: email.trim() } : {}),
        ...(offer80G && want80G ? { taxId: { idType, idNumber: idNumber.trim().toUpperCase(), ...(address.trim() ? { address: address.trim() } : {}) } } : {}),
      });
      router.push(donationPayHref(d.id, d.accessKey));
      return; // keep the lock — we're navigating away
    } catch (e) {
      const err = e instanceof BookingError ? e : null;
      if (err?.status === 503 || err?.code === 'PAYOUTS_NOT_READY') setSubmitError(t('donate.notReady'));
      else if (err?.status === 404) setSubmitError(t('donate.closed'));
      else setSubmitError(errText(e));
    }
    submitLock.current = false;
    setSubmitting(false);
  }

  return (
    <PublicShell>
      <div className="flex flex-col gap-4">
        <Link href={back} className="inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-orange-700">
          <ArrowLeft aria-hidden className="h-4 w-4" /> {t('donate.back')}
        </Link>

        <FestivalBanner
          type={info.festivalType}
          title={info.name}
          subtitle={info.organization.name}
          logoUrl={info.organization.logoUrl}
          bannerUrl={info.organization.bannerUrl}
          meta={<span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5">{fmtRangeL(info.startDate, info.endDate, locale)}</span>}
        />

        <h1 className="flex items-center gap-2 px-1 text-2xl font-extrabold text-slate-900">
          <HeartHandshake aria-hidden className="h-7 w-7" style={{ color: theme.ink }} /> {t('donate.title')}
        </h1>

        {!info.onlinePayments ? (
          <Alert kind="warning">{t('donate.notReady')}</Alert>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
              <h2 className="font-bold text-slate-900">{t('donate.amount')}</h2>
              <div role="group" aria-label={t('donate.amount')} className="grid grid-cols-3 gap-2">
                {info.suggestedAmounts.map((a) => {
                  const sel = amount === String(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => {
                        setAmount(String(a));
                        clear('amount');
                      }}
                      className={cx(
                        'min-h-[52px] rounded-2xl border-2 text-lg font-extrabold tabular-nums transition',
                        sel ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm' : 'border-slate-200 bg-white text-slate-900 hover:border-orange-200',
                      )}
                    >
                      ₹{a.toLocaleString('en-IN')}
                    </button>
                  );
                })}
              </div>
              <LabeledInput
                label={t('donate.amountOther')}
                required
                inputMode="decimal"
                value={amount}
                maxLength={10}
                onChange={(e) => {
                  setAmount(e.target.value.replace(/[^\d.]/g, ''));
                  clear('amount');
                }}
                error={errors.amount}
                aria-invalid={!!errors.amount}
                placeholder="501"
              />
            </section>

            <section className="flex flex-col gap-3 rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
              <h2 className="font-bold text-slate-900">{t('donate.yourDetails')}</h2>
              <Checkbox
                checked={anonymous}
                onChange={(v) => {
                  setAnonymous(v);
                  clear('name');
                }}
                label={
                  <span>
                    <span className="font-semibold">{t('donate.anon')}</span>
                    <span className="block text-xs text-slate-500">{t('donate.anonHint')}</span>
                  </span>
                }
              />
              {!anonymous && (
                <LabeledInput
                  label={t('book.fullName')}
                  required
                  autoComplete="name"
                  value={name}
                  maxLength={150}
                  onChange={(e) => {
                    setName(e.target.value);
                    clear('name');
                  }}
                  error={errors.name}
                  aria-invalid={!!errors.name}
                  placeholder={t('book.namePlaceholder')}
                />
              )}
              <LabeledInput
                label={t('donate.mobile')}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={mobile}
                maxLength={16}
                onChange={(e) => {
                  setMobile(e.target.value);
                  clear('mobile');
                }}
                error={errors.mobile}
                aria-invalid={!!errors.mobile}
                placeholder={t('book.mobilePlaceholder')}
              />
              <LabeledInput
                label={t('book.email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                maxLength={200}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clear('email');
                }}
                error={errors.email}
                aria-invalid={!!errors.email}
                hint={t('donate.emailHint')}
                placeholder="you@example.com"
              />
            </section>

            {offer80G && (
              <section className="flex flex-col gap-3 rounded-3xl border border-emerald-100 bg-emerald-50/40 p-4">
                <Checkbox
                  checked={want80G}
                  onChange={setWant80G}
                  label={
                    <span>
                      <span className="font-semibold">{t('donate.tax', { pct: info.deduction80G ?? 0 })}</span>
                      <span className="block text-xs text-slate-500">{t('donate.taxHint')}</span>
                    </span>
                  }
                />
                {want80G && (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <LabeledSelect label={t('donate.idType')} value={idType} onChange={(e) => setIdType(e.target.value)}>
                        {DONOR_ID_TYPES.map((x) => (
                          <option key={x.key} value={x.key}>
                            {x.label}
                          </option>
                        ))}
                      </LabeledSelect>
                      <LabeledInput
                        label={t('donate.idNumber')}
                        required
                        autoCapitalize="characters"
                        autoComplete="off"
                        value={idNumber}
                        maxLength={40}
                        onChange={(e) => {
                          setIdNumber(e.target.value.toUpperCase());
                          clear('idNumber');
                        }}
                        error={errors.idNumber}
                        aria-invalid={!!errors.idNumber}
                        placeholder={DONOR_ID_TYPES.find((x) => x.key === idType)?.placeholder}
                      />
                    </div>
                    <LabeledInput label={t('donate.address')} autoComplete="street-address" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} />
                  </>
                )}
              </section>
            )}

            {submitError && <Alert kind="warning">{submitError}</Alert>}

            <p className="flex items-start gap-2 px-1 text-sm text-slate-500">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {t('donate.note', { org: info.organization.name })}
            </p>

            <Button type="submit" size="lg" loading={submitting} className="w-full">
              {!submitting && <HandCoins aria-hidden className="h-5 w-5" />}
              {amountOk ? t('donate.pay', { amount: fmtMoney(amount.trim()) }) : t('donate.continue')}
            </Button>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
