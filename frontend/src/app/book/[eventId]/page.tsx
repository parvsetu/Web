'use client';

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
import { fmtDate, fmtMoney, todayIn } from '@/lib/format';
import {
  BookingError,
  booking,
  bookingErrorMessage,
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

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    booking
      .event(eventId)
      .then((e) => alive && setEvent(e))
      .catch((e) => alive && setLoadError(e instanceof BookingError ? e : new BookingError(0, bookingErrorMessage(e))));
    return () => {
      alive = false;
    };
  }, [eventId, reload]);

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
      setAvailError(bookingErrorMessage(e));
      return null;
    } finally {
      setAvailLoading(false);
    }
  }, [eventId]);

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
    if (!slot || !slotUsable) e.slot = 'Choose a time slot.';
    const n = name.trim();
    if (n.length < 2) e.name = 'Enter your name (at least 2 letters).';
    else if (n.length > 100) e.name = 'Name is too long.';
    const m = normalizeIndianMobile(mobile);
    if (!mobile.trim()) e.mobile = 'Enter your mobile number.';
    else if (!m) e.mobile = 'Enter a valid 10-digit Indian mobile number.';
    const em = email.trim();
    if (em && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) e.email = 'Enter a valid email, or leave it empty.';
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
        setSubmitError({ kind: 'warning', text: 'Sorry — that slot just filled up. We refreshed the availability; please pick another slot or fewer people.' });
        await loadAvailability(date);
        document.getElementById('step-slot')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (err?.status === 400) {
        setSubmitError({ kind: 'warning', text: err.message });
        await loadAvailability(date);
      } else if (err?.status === 503) {
        setSubmitError({ kind: 'warning', text: 'Online payment isn’t available for this festival right now. Free slots can still be booked.' });
      } else if (err?.status === 404) {
        setSubmitError({ kind: 'error', text: 'This festival or slot is no longer taking bookings.' });
        await loadAvailability(date);
      } else {
        setSubmitError({ kind: 'error', text: bookingErrorMessage(e) });
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
            <Empty title="This festival isn’t taking bookings" icon={CalendarX}>
              It may have ended, or the organiser has closed online booking.
              <div className="mt-4">
                <Link href="/book" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-orange-600 px-4 font-semibold text-white">
                  <ArrowLeft aria-hidden className="h-5 w-5" /> Browse festivals
                </Link>
              </div>
            </Empty>
          ) : (
            <Alert>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{loadError.message}</span>
                <Button size="sm" variant="secondary" onClick={() => setReload((n) => n + 1)}>
                  <RotateCcw aria-hidden className="h-4 w-4" /> Retry
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
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading festival">
          <Skeleton className="h-40 w-full rounded-3xl" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-64 w-full rounded-3xl" />
        </div>
      </PublicShell>
    );
  }

  const theme = festivalTheme(event.festivalType);
  const place = placeLine(event);
  const festivalOver = openDays.length === 0;

  return (
    <PublicShell bottomPad={!festivalOver}>
      <div className="flex flex-col gap-4">
        <Link href="/book" className="inline-flex min-h-[40px] w-fit items-center gap-1.5 rounded-xl text-sm font-semibold text-slate-600 hover:text-orange-700">
          <ArrowLeft aria-hidden className="h-4 w-4" /> All festivals
        </Link>

        <FestivalBanner
          type={event.festivalType}
          title={event.name}
          subtitle={event.organization.name}
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

        {festivalOver ? (
          <Empty title="This festival has ended" icon={CalendarX}>
            Bookings are closed for every day of this festival.
          </Empty>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <Step n={1} title="Choose a day" hint={`${openDays.length} day${openDays.length === 1 ? '' : 's'} left to book`} theme={theme}>
              <DateChips days={days} today={today} value={date} onChange={(d) => setDate(d)} theme={theme} />
            </Step>

            <Step n={2} id="step-slot" title="Pick a time slot" hint={date ? fmtDate(date) : undefined} theme={theme}>
              {availError ? (
                <Alert>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{availError}</span>
                    <Button size="sm" variant="secondary" onClick={() => setAvailReload((n) => n + 1)}>
                      <RotateCcw aria-hidden className="h-4 w-4" /> Retry
                    </Button>
                  </div>
                </Alert>
              ) : !avail || avail.date !== date ? (
                <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading slots">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : slots.length === 0 ? (
                <Empty title="No time slots on this day" icon={Clock}>
                  Try another day.
                </Empty>
              ) : (
                <div role="radiogroup" aria-label="Time slot" className={cx('flex flex-col gap-2', availLoading && 'opacity-60')}>
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
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">No slots left on this day — please pick another day.</p>
                  )}
                </div>
              )}
              {errors.slot && <p className="mt-2 text-sm font-semibold text-red-700">{errors.slot}</p>}
            </Step>

            <Step
              n={3}
              title="How many people?"
              hint={
                slot && slot.remaining !== null && slot.remaining < event.maxVisitorsPerToken
                  ? `Only ${slot.remaining} place${slot.remaining === 1 ? '' : 's'} left in this slot`
                  : `Up to ${event.maxVisitorsPerToken} people per booking`
              }
              theme={theme}
            >
              <PeopleStepper value={people} max={maxPeople} onChange={setPeople} theme={theme} />
              {people > 1 && (
                <fieldset className="mt-4">
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Passes</legend>
                  <div role="radiogroup" aria-label="Passes" className="grid gap-2 sm:grid-cols-2">
                    {[
                      { v: true, title: 'Separate QR for each person', sub: `Recommended · ${people} passes, enter separately`, icon: QrCode },
                      { v: false, title: 'One QR for the whole group', sub: `1 pass admits all ${people} together`, icon: Users },
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

            <Step n={4} id="step-details" title="Your details" hint="We put your name on the pass" theme={theme}>
              <div className="flex flex-col gap-3">
                <LabeledInput
                  label="Full name"
                  autoComplete="name"
                  value={name}
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
                  }}
                  error={errors.name}
                  aria-invalid={!!errors.name}
                  placeholder="e.g. Ananya Sharma"
                />
                <LabeledInput
                  label="Mobile number"
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
                  placeholder="10-digit mobile"
                  hint="Indian mobile number, used only for this booking"
                />
                <LabeledInput
                  label="Email (optional)"
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
                ? 'Your pass is a one-time QR — show it at the gate.'
                : `We hold your places for ${event.holdMinutes} minutes while you pay. The final amount is confirmed on the next screen.`}
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
                            {people} {people === 1 ? 'person' : 'people'} · <span className="text-emerald-700">Free</span>
                          </>
                        ) : (
                          <>
                            {people} {people === 1 ? 'person' : 'people'} × {fmtMoney(slot.price)}
                            {gstOnTop ? ` + ${gstRate}% GST` : ''} ={' '}
                            <span className="text-lg" style={{ color: theme.ink }}>
                              {fmtMoney(preview)}
                            </span>
                            {event?.gst && !gstOnTop && <span className="ml-1 text-xs font-normal text-slate-500">(incl. {gstRate}% GST)</span>}
                          </>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">Choose a day and time slot</p>
                  )}
                </div>
                <Button type="submit" size="md" loading={submitting} className="min-h-[52px] shrink-0 px-5 text-base">
                  {!submitting && (free ? <Ticket aria-hidden className="h-5 w-5" /> : <CreditCard aria-hidden className="h-5 w-5" />)}
                  {!slot ? 'Continue' : free ? 'Get free pass' : `Pay ${fmtMoney(preview)}`}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
