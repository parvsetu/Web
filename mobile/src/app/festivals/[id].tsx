import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { ApiError, errorMessage } from '../../lib/api';
import { booking, cacheOrder, normalizeIndianMobile, savePass } from '../../lib/booking';
import { dayLabel, festivalDays, fmtHHmm, fmtDateTime, fmtMoney, festivalTypeLabel, isFree, salesStateAt, todayIn } from '../../lib/format';
import type { Availability, BookableEventDetail } from '../../lib/types';
import { Alert, Button, C, Card, Chip, Field, Loading, s } from '../../components/ui';

export default function Festival() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ev, setEv] = useState<BookableEventDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [availError, setAvailError] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ name?: string; mobile?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadEvent = useCallback(async () => {
    setLoadError(null);
    try {
      const d = await booking.event(id);
      setEv(d);
    } catch (e) {
      setLoadError(e instanceof ApiError && e.status === 404 ? 'This festival is not taking bookings.' : errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  // Only today and later festival days can be booked.
  const days = useMemo(() => {
    if (!ev) return [];
    const today = todayIn(ev.timezone);
    return festivalDays(ev.startDate, ev.endDate).filter((d) => d >= today);
  }, [ev]);

  useEffect(() => {
    if (days.length && !date) setDate(days[0]);
  }, [days, date]);

  useEffect(() => {
    if (!ev || !date) return;
    let alive = true;
    setAvail(null);
    setAvailError(null);
    setSlotId(null);
    booking
      .availability(ev.id, date)
      .then((a) => alive && setAvail(a))
      .catch((e) => alive && setAvailError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [ev, date]);

  const slot = avail?.slots.find((x) => x.id === slotId) ?? null;
  const maxCount = ev ? Math.max(1, Math.min(ev.maxVisitorsPerToken || 10, slot?.remaining ?? 99)) : 1;
  useEffect(() => {
    if (count > maxCount) setCount(maxCount);
  }, [count, maxCount]);

  async function submit() {
    if (!ev || !slot || !date) return;
    const errs: typeof errors = {};
    if (name.trim().length < 2) errs.name = 'Enter your name.';
    const m = normalizeIndianMobile(mobile);
    if (!m) errs.mobile = 'Enter a 10-digit Indian mobile number.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const order = await booking.createOrder({
        eventId: ev.id,
        timeSlotId: slot.id,
        date,
        visitorCount: count,
        buyerName: name.trim(),
        buyerMobile: m!,
        buyerEmail: email.trim() || undefined,
      });
      await savePass({ orderId: order.id, accessKey: order.accessKey, eventName: ev.name, createdAt: order.createdAt });
      await cacheOrder(order);
      router.replace({ pathname: '/passes/[orderId]', params: { orderId: order.id, k: order.accessKey } });
    } catch (e) {
      setSubmitError(e instanceof ApiError && e.code === 'SLOT_FULL' ? 'That slot just sold out. Please pick another.' : errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError)
    return (
      <View style={s.pad}>
        <Alert>{loadError}</Alert>
        <Button kind="secondary" title="Retry" onPress={() => void loadEvent()} />
      </View>
    );
  if (!ev) return <Loading label="Loading festival…" />;

  const total = slot ? Number(slot.price) * count : 0;
  const sales = salesStateAt(ev.bookingOpensAt, ev.bookingClosesAt);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.screen} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <View>
          <Text style={{ color: C.brandDark, fontWeight: '700', fontSize: 12, textTransform: 'uppercase' }}>{festivalTypeLabel(ev.festivalType)}</Text>
          <Text style={s.h1}>{ev.name}</Text>
          <Text style={s.muted}>
            {ev.organization.name}
            {ev.location ? ` · ${ev.location}` : ''}
          </Text>
          {ev.description ? <Text style={[s.body, { marginTop: 8 }]}>{ev.description}</Text> : null}
        </View>

        {days.length === 0 ? (
          <Alert kind="warning">This festival has ended.</Alert>
        ) : sales === 'NOT_YET' ? (
          <Alert kind="info">Online booking opens on {fmtDateTime(ev.bookingOpensAt!, ev.timezone)}.</Alert>
        ) : sales === 'CLOSED' ? (
          <Alert kind="warning">Online booking has closed for this festival.</Alert>
        ) : (
          <>
            <Card>
              <Text style={s.h2}>1. Pick a day</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
                {days.map((d) => (
                  <Chip key={d} label={dayLabel(d)} selected={d === date} onPress={() => setDate(d)} />
                ))}
              </ScrollView>
            </Card>

            <Card>
              <Text style={s.h2}>2. Pick a time</Text>
              {availError ? <Alert>{availError}</Alert> : null}
              {!avail && !availError ? <Loading label="Checking places…" /> : null}
              <View style={{ gap: 8, marginTop: 10 }}>
                {avail?.slots.map((x) => {
                  const soldOut = x.ended || x.remaining === 0;
                  return (
                    <Chip
                      key={x.id}
                      disabled={soldOut}
                      selected={x.id === slotId}
                      onPress={() => setSlotId(x.id)}
                      label={`${x.label} · ${fmtHHmm(x.startTime)}–${fmtHHmm(x.endTime)} · ${isFree(x.price) ? 'Free' : fmtMoney(x.price)}${
                        x.ended ? ' · ended' : x.remaining === 0 ? ' · sold out' : x.remaining !== null && x.remaining <= 20 ? ` · ${x.remaining} left` : ''
                      }`}
                    />
                  );
                })}
                {avail && avail.slots.length === 0 ? <Text style={s.muted}>No slots on this day.</Text> : null}
              </View>
            </Card>

            <Card>
              <Text style={s.h2}>3. Your details</Text>
              <View style={[s.row, { marginVertical: 12, justifyContent: 'space-between' }]}>
                <Text style={s.body}>People</Text>
                <View style={s.row}>
                  <Chip label="−" onPress={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} />
                  <Text accessibilityLiveRegion="polite" style={[s.h2, { minWidth: 32, textAlign: 'center' }]}>
                    {count}
                  </Text>
                  <Chip label="+" onPress={() => setCount((c) => Math.min(maxCount, c + 1))} disabled={count >= maxCount} />
                </View>
              </View>
              <Field label="Name *" value={name} onChangeText={setName} autoComplete="name" textContentType="name" error={errors.name} />
              <Field
                label="Mobile *"
                value={mobile}
                onChangeText={setMobile}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                error={errors.mobile}
              />
              <Field
                label="Email (optional)"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
            </Card>

            {submitError ? <Alert>{submitError}</Alert> : null}
            {slot && !isFree(slot.price) && !ev.onlinePayments ? (
              <Alert kind="warning">Online payment is not available for this festival yet.</Alert>
            ) : null}
            <Button
              title={!slot ? 'Pick a time slot' : isFree(slot.price) ? 'Get free pass' : `Continue · ${fmtMoney(total)}`}
              disabled={!slot || (!isFree(slot.price) && !ev.onlinePayments)}
              loading={submitting}
              onPress={() => void submit()}
            />
            {slot && !isFree(slot.price) ? (
              <Text style={[s.muted, { textAlign: 'center' }]}>Your places are held for {ev.holdMinutes} minutes while you pay. The final amount is shown on the next screen.</Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
