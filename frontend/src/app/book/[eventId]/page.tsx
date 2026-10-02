'use client';

import { VenueCard } from '@/components/VenueDetails';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarX, Clock, CreditCard, MapPin, QrCode, RotateCcw, ShieldCheck, Ticket, Users } from 'lucide-react';
import { FestivalBanner } from '@/components/FestivalBanner';
import { SponsorStrip } from '@/components/SponsorStrip';
import { PublicShell } from '@/components/booking/PublicShell';
import { DateChips, PeopleStepper, SlotCard, Step, slotState } from '@/components/booking/BookingParts';
import { placeLine } from '@/components/booking/EventCard';
import { Alert, Button, Empty, LabeledInput, Skeleton, cx } from '@/components/ui';
import { festivalTheme } from '@/lib/festival-theme';
import { fmtMoney, todayIn } from '@/lib/format';
import { fmtDateL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';
import {
  BookingError,
  booking,
  demoPayHref,
  festivalDays,
  isFree,
  normalizeIndianMobile,
  passHref,
  savePass,
} from '@/lib/booking';
import type { Availability, BookableEventDetail } from '@/lib/booking-types';

type Errors = Partial<Record<'slot' | 'name' | 'mobile' | 'email', string>>;

export default function BookEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<BookableEventDetail | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [reload, setReload] = useState(0);

  const [date, setDate] = useState('');
  const [avail, setAvail] = useState<Availability | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [availError, setAvailError] = useState<string | null>(null);
  const [availReload, setAvailReload] = useState(0);

  const [slotId, setSlotId] = useState('');
  const [people, setPeople] = useState(1);
  const [perPerson, setPerPerson] = useState(true);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<{ kind: 'error' | 'warning'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const { t, tp, tn, locale } = useT();
  const errText = useBookingErrorText();
  const fmtDate = (d: string) => fmtDateL(d, locale);

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    booking
      .event(eventId)
      .then((e) => alive && setEvent(e))
      .catch((e) => alive && setLoadError(e instanceof BookingError ? e : new BookingError(0, errText(e))));
    return () => {
      alive = false;
    };
  }, [eventId, reload, errText]);

  const tz = event?.timezone ?? 'Asia/Kolkata';
  const today = useMemo(() => todayIn(tz), [tz]);
  const days = useMemo(() => (event ? festivalDays(event.startDate, event.endDate) : []), [event]);
  const openDays = useMemo(() => days.filter((d) => d >= today), [days, today]);

  // Pick the default day once the festival loads.
  useEffect(() => {
    if (!event || date) return;
    setDate(openDays.includes(today) ? today : (openDays[0] ?? ''));
  }, [event, openDays, today, date]);

  const loadAvailability = useCallback(async (d: string) => {
    setAvailLoading(true);
    setAvailError(null);
    try {
      const a = await booking.availability(eventId, d);
      setAvail(a);
      return a;
    } catch (e) {
      setAvailError(errText(e));
      return null;
    } finally {
      setAvailLoading(false);
    }
  }, [eventId, errText]);

  useEffect(() => {
    if (!date) return;
    setAvail(null);
    void loadAvailability(date);
  }, [date, availReload, loadAvailability]);

  const onlinePayments = event?.onlinePayments ?? false;
  const slots = avail?.date === date ? avail.slots : [];
  const slot = slots.find((s) => s.id === slotId) ?? null;
  const slotUsable = slot ? ['open', 'low'].includes(slotState(slot, onlinePayments)) : false;

  // Drop a selection that's no longer bookable (new day, sold out on refresh, …).
  useEffect(() => {
    if (slotId && avail && avail.date === date && !slotUsable) setSlotId('');
  }, [avail, date, slotId, slotUsable]);

  const maxPeople = Math.max(1, Math.min(event?.maxVisitorsPerToken ?? 1, slot?.remaining ?? Number.POSITIVE_INFINITY));
  useEffect(() => {
    if (people > maxPeople) setPeople(maxPeople);
  }, [people, maxPeople]);

  // Display-only preview; the server computes the real amount.
  const base = slot ? Number(slot.price) * people : null;
  // Mirrors the server's slabRateBps: slab is decided on one ticket's pre-GST value.
  const gstRate = (() => {
    const g = event?.gst;
    if (!g) return 0;
    if (g.mode !== 'SLAB' || !slot) return g.ratePercent;
    const low = g.lowRatePercent ?? g.ratePercent;
    const unit = Number(slot.price);
    const taxable = g.bearer === 'CUSTOMER' ? unit : unit / (1 + low / 100);
    return Math.round(taxable * 100) <= Math.round(Number(g.threshold) * 100) ? low : g.ratePercent;
  })();
  const gstOnTop = event?.gst?.bearer === 'CUSTOMER' && gstRate > 0;
  const preview = base === null ? null : gstOnTop ? Math.round(base * (100 + gstRate)) / 100 : base;
  const free = slot ? isFree(slot.price) : false;

  function validate(): { ok: boolean; mobile: string | null } {
    const e: Errors = {};
    if (!slot || !slotUsable) e.slot = t('book.v.slot');
    const n = name.trim();
    if (n.length < 2) e.name = t('book.v.nameShort');
    else if (n.length > 100) e.name = t('book.v.nameLong');
    const m = normalizeIndianMobile(mobile);
    if (!mobile.trim()) e.mobile = t('book.v.mobileEmpty');
    else if (!m) e.mobile = t('book.v.mobileInvalid');
    const em = email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = t('book.v.email');
    setErrors(e);
    if (Object.keys(e).length) {
      const first = e.slot ? 'step-slot' : 'step-details';
      document.getElementById(first)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return { ok: Object.keys(e).length === 0, mobile: m };
  }

  async function submit(ev?: FormEvent) {
    ev?.preventDefault();
    if (submitLock.current || !event) return;
    setSubmitError(null);
    const v = validate();
    if (!v.ok || !slot || !v.mobile) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const order = await booking.createOrder({
        eventId: event.id,
        timeSlotId: slot.id,
        date,
        visitorCount: people,
        perPersonPasses: people > 1 ? perPerson : undefined,
        buyerName: name.trim(),
        buyerMobile: v.mobile,
        ...(email.trim() ? { buyerEmail: email.trim() } : {}),
      });
      savePass({ orderId: order.id, accessKey: order.accessKey, eventName: event.name, createdAt: order.createdAt });
      if (order.status === 'PAID') router.push(passHref(order.id, order.accessKey));
      else if (order.status === 'PENDING' && order.payment.demo) router.push(demoPayHref(order.id, order.accessKey));
      else router.push(passHref(order.id, order.accessKey));
      return; // keep the lock — we're navigating away
    } catch (e) {
      const err = e instanceof BookingError ? e : null;
      if (err?.code === 'SLOT_FULL' || err?.status === 409) {
        setSubmitError({ kind: 'warning', text: t('book.err.slotFull') });
        await loadAvailability(date);
        document.getElementById('step-slot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (err?.status === 400) {
        setSubmitError({ kind: 'warning', text: err.message });
        await loadAvailability(date);
      } else if (err?.status === 503) {
        setSubmitError({ kind: 'warning', text: t('book.err.noPayment') });
      } else if (err?.status === 404) {
        setSubmitError({ kind: 'error', text: t('book.err.closed') });
        await loadAvailability(date);
      } else {
        setSubmitError({ kind: 'error', text: errText(e) });
      }
    }
    submitLock.current = false;
    setSubmitting(false);
  }

  if (loadError) {
    return (
      <PublicShell>
        <div className="flex flex-col gap-4 pt-4">
          {loadError.status === 404 ? (
            <Empty title={t('book.notTaking')} icon={CalendarX}>
              {t('book.notTakingHint')}
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

  if (!event) {
    return (
      <PublicShell>
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('book.loading')}>
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </PublicShell>
    );
  }

  const theme = festivalTheme(event.festivalType);
  const peak = new Map((event.peakDates ?? []).map((p) => [p.date, p.label]));
  const place = placeLine(event);
  const festivalOver = openDays.length === 0;

  return (
    <PublicShell bottomPad={!festivalOver}>
      <div className="flex flex-col gap-4">
        <Link href="/" className="inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-orange-700">
          <ArrowLeft aria-hidden className="h-4 w-4" /> {t('book.allFestivals')}
        </Link>

        <FestivalBanner
          type={event.festivalType}
          title={event.name}
          subtitle={
            event.organization.landingSlug ? (
              <Link href={`/m/${event.organization.landingSlug}`} className="underline decoration-white/50 underline-offset-2 hover:decoration-white">{event.organization.name}</Link>
            ) : (
              event.organization.name
            )
          }
          logoUrl={event.organization.logoUrl}
          bannerUrl={event.organization.bannerUrl}
          meta={
            <>
              {place && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5">
                  <MapPin aria-hidden className="h-3.5 w-3.5" /> {place}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5">
                {fmtDate(event.startDate)} – {fmtDate(event.endDate)}
              </span>
            </>
          }
        />
        {event.description && <p className="px-1 text-slate-700">{event.description}</p>}
        <SponsorStrip sponsors={event.sponsors} compact />
        <VenueCard venue={event.venue} map={false} />

        {festivalOver ? (
          <Empty title={t('book.ended')} icon={CalendarX}>
            {t('book.endedHint')}
          </Empty>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Step n={1} title={t('book.step1')} hint={tp('book.daysLeft', openDays.length)} theme={theme}>
              <DateChips days={days} today={today} value={date} onChange={(d) => setDate(d)} theme={theme} peak={peak} />
              {peak.size > 0 && <p className="mt-3 text-xs text-slate-500">{tn('book.peakNote', { peak: <span className="font-bold text-rose-700">{t('slot.peak')}</span> })}</p>}
            </Step>

            <Step n={2} id="step-slot" title={t('book.step2')} hint={date ? fmtDate(date) : undefined} theme={theme}>
              {availError ? (
                <Alert>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{availError}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAvailReload((n) => n + 1)}>
                      <RotateCcw aria-hidden className="h-4 w-4" /> {t('common.retry')}
                    </Button>
                  </div>
                </Alert>
              ) : !avail || avail.date !== date ? (
                <div className="flex flex-col gap-2" aria-busy="true" aria-label={t('book.loadingSlots')}>
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <Empty title={t('book.noSlots')} icon={Clock}>
                  {t('book.tryAnotherDay')}
                </Empty>
              ) : (
                <div role="radiogroup" aria-label={t('book.timeSlot')} className={cx('flex flex-col gap-2', availLoading && 'opacity-60')}>
                  {slots.map((s) => (
                    <SlotCard
                      key={s.id}
                      slot={s}
                      state={slotState(s, onlinePayments)}
                      selected={s.id === slotId}
                      onSelect={() => {
                        setSlotId(s.id);
                        setErrors((e) => ({ ...e, slot: undefined }));
                      }}
                      theme={theme}
                    />
                  ))}
                  {slots.every((s) => !['open', 'low'].includes(slotState(s, onlinePayments))) && (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('book.noSlotsLeft')}</p>
                  )}
                </div>
              )}
              {errors.slot && <p className="mt-2 text-sm font-semibold text-red-700">{errors.slot}</p>}
            </Step>

            <Step
              n={3}
              title={t('book.step3')}
              hint={
                slot && slot.remaining !== null && slot.remaining < event.maxVisitorsPerToken
                  ? tp('book.onlyLeft', slot.remaining)
                  : t('book.upTo', { n: event.maxVisitorsPerToken })
              }
              theme={theme}
            >
              <PeopleStepper value={people} max={maxPeople} onChange={setPeople} theme={theme} />
              {people > 1 && (
                <fieldset className="mt-4">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">{t('book.passes')}</legend>
                  <div role="radiogroup" aria-label={t('book.passes')} className="grid gap-2 sm:grid-cols-2">
                    {[
                      { v: true, title: t('book.separate'), sub: t('book.separateSub', { n: people }), icon: QrCode },
                      { v: false, title: t('book.group'), sub: t('book.groupSub', { n: people }), icon: Users },
                    ].map((o) => {
                      const sel = perPerson === o.v;
                      return (
                        <button
                          key={String(o.v)}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => setPerPerson(o.v)}
                          className={cx(
                            'flex min-h-[64px] items-start gap-2 rounded-2xl border-2 p-3 text-left transition',
                            sel ? 'shadow-sm' : 'border-orange-100 bg-white hover:border-orange-300',
                          )}
                          style={sel ? { borderColor: theme.via, background: theme.soft } : undefined}
                        >
                          <o.icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: sel ? theme.ink : '#94a3b8' }} />
                          <span>
                            <span className="block text-sm font-bold text-slate-900">{o.title}</span>
                            <span className="block text-xs text-slate-500">{o.sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </Step>

            <Step n={4} id="step-details" title={t('book.step4')} hint={t('book.step4Hint')} theme={theme}>
              <div className="flex flex-col gap-3">
                <LabeledInput
                  label={t('book.fullName')}
                  autoComplete="name"
                  value={name}
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                  }}
                  error={errors.name}
                  aria-invalid={!!errors.name}
                  placeholder={t('book.namePlaceholder')}
                />
                <LabeledInput
                  label={t('book.mobile')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={mobile}
                  maxLength={16}
                  onChange={(e) => {
                    setMobile(e.target.value);
                    if (errors.mobile) setErrors((x) => ({ ...x, mobile: undefined }));
                  }}
                  error={errors.mobile}
                  aria-invalid={!!errors.mobile}
                  placeholder={t('book.mobilePlaceholder')}
                  hint={t('book.mobileHint')}
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
                    if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
                  }}
                  error={errors.email}
                  aria-invalid={!!errors.email}
                  placeholder="you@example.com"
                />
              </div>
            </Step>

            {submitError && <Alert kind={submitError.kind}>{submitError.text}</Alert>}

            <p className="flex items-start gap-2 px-1 text-sm text-slate-500">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              {free || !slot
                ? t('book.oneTimeQr')
                : t('book.holdNote', { n: event.holdMinutes })}
            </p>

            {/* sticky summary */}
            <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-orange-100 bg-white/95 shadow-[0_-8px_24px_rgba(124,45,18,0.08)] backdrop-blur pb-safe">
              <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pt-3">
                <div className="min-w-0 flex-1" aria-live="polite">
                  {slot ? (
                    <>
                      <p className="truncate text-xs font-semibold text-slate-500">
                        {slot.label} · {fmtDate(date)}
                      </p>
                      <p className="text-sm font-bold text-slate-900">
                        {free ? (
                          <>
                            {tp('common.people', people)} · <span className="text-emerald-700">{t('common.free')}</span>
                          </>
                        ) : (
                          <>
                            {tp('common.people', people)} × {fmtMoney(slot.price)}
                            {gstOnTop ? ` ${t('book.gstOnTop', { rate: gstRate })}` : ''} ={' '}
                            <span className="text-lg" style={{ color: theme.ink }}>
                              {fmtMoney(preview)}
                            </span>
                            {event?.gst && !gstOnTop && <span className="ml-1 text-xs font-normal text-slate-500">{t('book.gstIncl', { rate: gstRate })}</span>}
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">{t('book.chooseDaySlot')}</p>
                  )}
                </div>
                <Button type="submit" size="md" loading={submitting} className="min-h-[52px] max-w-[48%] shrink-0 whitespace-normal px-4 text-base leading-tight sm:max-w-none sm:px-5">
                  {!submitting && (free ? <Ticket aria-hidden className="h-5 w-5" /> : <CreditCard aria-hidden className="h-5 w-5" />)}
                  {!slot ? t('book.continue') : free ? t('book.getFree') : t('book.pay', { amount: fmtMoney(preview) })}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
