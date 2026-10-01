'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { DEFAULT_TZ, DURATION_PRESETS, durationLabel, humanize } from '@/lib/format';
import type { EventBody, EventDetail, EventStatus } from '@/lib/types';
import { FestivalBadge } from './FestivalBanner';
import { Alert, Button, Checkbox, Field, LabeledInput, LabeledSelect, Textarea, cx } from './ui';
import { LocateFixed, MapPin } from 'lucide-react';
import { FestivalTypeSelect, StateCityPicker } from './PlacePicker';
import { PrintFormatPicker, type PrintFormat } from './PrintFormat';
import { useFestivalTypes } from '@/lib/catalog';

const STATUSES: EventStatus[] = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const TIMEZONES = ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore', 'Australia/Sydney'];

/** Create/edit an event. Festival types come from the server — never hard-coded. */
export function EventForm({
  initial,
  onSubmit,
  submitLabel,
  festivalTypes,
}: {
  /** The mandal's chosen festivals; the type dropdown lists only these (empty = all). */
  festivalTypes?: string[];
  initial?: EventDetail | null;
  onSubmit: (body: EventBody) => Promise<void>;
  submitLabel: string;
}) {
  const types = useFestivalTypes();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    festivalType: initial?.festivalType ?? '',
    description: initial?.description ?? '',
    location: initial?.location ?? '',
    startDate: initial?.startDate?.slice(0, 10) ?? '',
    endDate: initial?.endDate?.slice(0, 10) ?? '',
    timezone: initial?.timezone ?? DEFAULT_TZ,
    status: (initial?.status ?? 'DRAFT') as EventStatus,
    tokenPrefix: initial?.tokenPrefix ?? '',
    volunteerRegistrationOpen: initial?.volunteerRegistrationOpen ?? false,
    publicBookingEnabled: initial?.publicBookingEnabled ?? false,
    tokenDurationOptions: initial?.tokenDurationOptions ?? [],
    maxVisitorsPerToken: String(initial?.maxVisitorsPerToken ?? 10),
    state: initial?.state ?? '',
    city: initial?.city ?? '',
    gstEnabled: initial?.gstEnabled ?? false,
    gstRatePercent: String(initial?.gstRatePercent ?? 18),
    gstMode: (initial?.gstMode ?? 'SLAB') as 'FLAT' | 'SLAB',
    gstLowRatePercent: String(initial?.gstLowRatePercent ?? 5),
    gstSlabThreshold: String(initial?.gstSlabThreshold ?? 100),
    gstBearer: (initial?.gstBearer ?? 'CUSTOMER') as 'CUSTOMER' | 'MANDAL',
    gstSac: initial?.gstSac ?? '9996',
    passPrintFormat: (initial?.passPrintFormat ?? 'A4') as PrintFormat,
    venueAddress: initial?.venueAddress ?? '',
    venueLandmark: initial?.venueLandmark ?? '',
    venuePincode: initial?.venuePincode ?? '',
    venueMapUrl: initial?.venueMapUrl ?? '',
    venueCoords: initial?.venueLat != null && initial?.venueLng != null ? `${initial.venueLat}, ${initial.venueLng}` : '',
    venueNotes: initial?.venueNotes ?? '',
    venueContactPhone: initial?.venueContactPhone ?? '',
  });
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((x) => ({ ...x, [k]: e.target.value }));
  const selectedType = types.data?.find((t) => t.key === form.festivalType);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (!form.name.trim()) return setError('Enter a festival name.');
    if (!form.festivalType) return setError('Choose a festival type.');
    const coords = parseCoords(form.venueCoords);
    if (form.venueCoords.trim() && !coords) return setError('Map pin must be "latitude, longitude", e.g. 18.5204, 73.8567.');
    if (form.venuePincode.trim() && !/^\d{6}$/.test(form.venuePincode.trim())) return setError('PIN code must be 6 digits.');
    if (!form.startDate || !form.endDate) return setError('Choose start and end dates.');
    if (form.endDate < form.startDate) return setError('End date cannot be before start date.');
    if (form.tokenPrefix && !/^[A-Z0-9]{2,6}$/.test(form.tokenPrefix)) return setError('Token prefix must be 2–6 capital letters or digits.');
    const max = Number(form.maxVisitorsPerToken);
    if (!Number.isInteger(max) || max < 1) return setError('Max visitors per token must be 1 or more.');
    const body: EventBody = {
      name: form.name.trim(),
      festivalType: form.festivalType,
      description: form.description.trim() || undefined,
      location: form.location.trim() || undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      timezone: form.timezone,
      status: form.status,
      tokenPrefix: form.tokenPrefix || undefined,
      volunteerRegistrationOpen: form.volunteerRegistrationOpen,
      publicBookingEnabled: form.publicBookingEnabled,
      tokenDurationOptions: form.tokenDurationOptions,
      gstEnabled: form.gstEnabled,
      gstRatePercent: Number(form.gstRatePercent),
      gstMode: form.gstMode,
      gstLowRatePercent: Number(form.gstLowRatePercent),
      gstSlabThreshold: Math.max(1, Math.round(Number(form.gstSlabThreshold) || 100)),
      gstBearer: form.gstBearer,
      gstSac: form.gstSac.trim() || '9996',
      passPrintFormat: form.passPrintFormat,
      venueAddress: form.venueAddress.trim(),
      venueLandmark: form.venueLandmark.trim(),
      venuePincode: form.venuePincode.trim(),
      venueMapUrl: form.venueMapUrl.trim(),
      venueLat: coords ? coords[0] : null,
      venueLng: coords ? coords[1] : null,
      venueNotes: form.venueNotes.trim(),
      venueContactPhone: form.venueContactPhone.trim(),
      maxVisitorsPerToken: max,
      ...(form.state || initial ? { state: form.state } : {}),
      ...(form.city || initial ? { city: form.city.trim() } : {}),
    };
    setBusy(true);
    try {
      await onSubmit(body);
      setOk(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <LabeledInput label="Festival name" value={form.name} onChange={set('name')} placeholder="e.g. Sarvajanik Utsav 2026" />
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <FestivalTypeSelect only={festivalTypes} value={form.festivalType} onChange={(v) => setForm((x) => ({ ...x, festivalType: v }))} />
        </div>
        <FestivalBadge type={form.festivalType || null} className="h-14 w-14" />
      </div>
      {!!festivalTypes?.length && (
        <p className="-mt-2 text-xs text-slate-500">Showing only your mandal’s festivals. Change the list in Mandal → Settings.</p>
      )}
      {types.error && <Alert kind="warning">Could not load festival types: {types.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Start date" type="date" value={form.startDate} onChange={set('startDate')} />
        <LabeledInput label="End date" type="date" value={form.endDate} onChange={set('endDate')} />
      </div>
      <StateCityPicker state={form.state} city={form.city} onChange={(p) => setForm((x) => ({ ...x, ...p }))} />
      <div className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-3">
        <p className="flex items-center gap-2 font-semibold text-slate-800">
          <MapPin aria-hidden className="h-5 w-5 text-sky-600" /> Venue &amp; directions <span className="text-xs font-normal text-slate-500">— printed on every pass</span>
        </p>
        <LabeledInput label="Venue / pandal name" value={form.location} onChange={set('location')} placeholder="e.g. Salt Lake Central Park pandal" />
        <LabeledInput label="Street address" value={form.venueAddress} onChange={set('venueAddress')} placeholder="e.g. Sector 1, Salt Lake" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledInput label="Landmark" value={form.venueLandmark} onChange={set('venueLandmark')} placeholder="e.g. FD Park gate no. 2" />
          <LabeledInput label="PIN code" value={form.venuePincode} onChange={set('venuePincode')} inputMode="numeric" maxLength={6} placeholder="700064" />
        </div>
        <LabeledInput
          label="Google Maps link (optional)"
          value={form.venueMapUrl}
          onChange={set('venueMapUrl')}
          inputMode="url"
          placeholder="https://maps.app.goo.gl/…"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <LabeledInput label="Map pin (latitude, longitude — optional)" value={form.venueCoords} onChange={set('venueCoords')} placeholder="22.5800, 88.4150" />
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={locating}
            onClick={() => {
              if (!navigator.geolocation) return setError('This browser can’t share your location.');
              setLocating(true);
              navigator.geolocation.getCurrentPosition(
                (p) => {
                  setForm((x) => ({ ...x, venueCoords: `${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}` }));
                  setLocating(false);
                },
                () => {
                  setError('Couldn’t get your location — allow location access, or paste the pin.');
                  setLocating(false);
                },
                { enableHighAccuracy: true, timeout: 15000 },
              );
            }}
          >
            <LocateFixed aria-hidden className="h-4 w-4" /> I’m at the venue
          </Button>
        </div>
        <Field label="Entry, parking &amp; other directions (optional)">
          <Textarea value={form.venueNotes} onChange={set('venueNotes')} placeholder="e.g. Enter from Gate 2. Parking at Central Park lot. Wheelchair ramp near the main stage." />
        </Field>
        <LabeledInput label="Help-desk phone (optional)" value={form.venueContactPhone} onChange={set('venueContactPhone')} inputMode="tel" placeholder="98xxxxxxxx" />
        <p className="text-xs text-slate-500">No link or pin? Visitors get directions from the address. A pin or link is more accurate.</p>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={set('description')} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <LabeledSelect label="Status" value={form.status} onChange={set('status')} hint="Scanning works only when Active.">
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Timezone" value={form.timezone} onChange={set('timezone')}>
          {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </LabeledSelect>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput
          label="Token prefix"
          value={form.tokenPrefix}
          onChange={(e) => setForm((x) => ({ ...x, tokenPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }))}
          placeholder={selectedType?.defaultPrefix ?? 'AUTO'}
          hint="2–6 letters/digits. Empty = default for the festival type."
        />
        <LabeledInput label="Max visitors per token" type="number" min={1} value={form.maxVisitorsPerToken} onChange={set('maxVisitorsPerToken')} />
      </div>
      <Checkbox
        label="Open for volunteer sign-up"
        checked={form.volunteerRegistrationOpen}
        onChange={(v) => setForm((x) => ({ ...x, volunteerRegistrationOpen: v }))}
      />
      <Checkbox
        label={<span>Public pass booking <span className="text-sm text-slate-500">— visitors can book/buy passes on the website (set prices on Time slots)</span></span>}
        checked={form.publicBookingEnabled}
        onChange={(v) => setForm((x) => ({ ...x, publicBookingEnabled: v }))}
      />
      <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50/40 p-3">
        <Checkbox
          label={<span className="font-semibold">Charge GST on online pass sales</span>}
          checked={form.gstEnabled}
          onChange={(v) => setForm((x) => ({ ...x, gstEnabled: v }))}
        />
        {form.gstEnabled && (
          <>
            <LabeledSelect label="GST rate type" value={form.gstMode} onChange={(e) => setForm((x) => ({ ...x, gstMode: e.target.value as 'FLAT' | 'SLAB' }))}>
              <option value="SLAB">By ticket price (slab)</option>
              <option value="FLAT">One rate for every ticket</option>
            </LabeledSelect>
            {form.gstMode === 'SLAB' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <LabeledInput label="Ticket price up to (₹)" value={form.gstSlabThreshold} onChange={set('gstSlabThreshold')} inputMode="numeric" />
                <LabeledSelect label="Rate up to that price" value={form.gstLowRatePercent} onChange={set('gstLowRatePercent')}>
                  {[0, 5, 12, 18, 28].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </LabeledSelect>
                <LabeledSelect label="Rate above it" value={form.gstRatePercent} onChange={set('gstRatePercent')}>
                  {[0, 5, 12, 18, 28].map((r) => (
                    <option key={r} value={r}>{r}%</option>
                  ))}
                </LabeledSelect>
              </div>
            ) : (
              <LabeledSelect label="GST rate" value={form.gstRatePercent} onChange={set('gstRatePercent')}>
                {[0, 5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </LabeledSelect>
            )}
            {form.gstMode === 'SLAB' && (
              <p className="text-xs text-slate-500">
                Decided per ticket (per person), before GST: a ₹{form.gstSlabThreshold || 100} ticket pays {form.gstLowRatePercent}%, anything costlier pays {form.gstRatePercent}% — even if a group order totals more.
              </p>
            )}
            <LabeledInput label="SAC / HSN code" value={form.gstSac} onChange={set('gstSac')} inputMode="numeric" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who pays GST">
              {(['CUSTOMER', 'MANDAL'] as const).map((b) => {
                const r = Number(form.gstMode === 'SLAB' && 100 <= Number(form.gstSlabThreshold) ? form.gstLowRatePercent : form.gstRatePercent) || 0;
                const example = b === 'CUSTOMER' ? `₹100 pass → visitor pays ₹${(100 + r).toFixed(2)}` : `₹100 pass → ₹${(100 / (1 + r / 100)).toFixed(2)} + ₹${(100 - 100 / (1 + r / 100)).toFixed(2)} GST`;
                return (
                  <button
                    key={b}
                    type="button"
                    role="radio"
                    aria-checked={form.gstBearer === b}
                    onClick={() => setForm((x) => ({ ...x, gstBearer: b }))}
                    className={cx('flex min-h-[64px] flex-col items-start justify-center rounded-xl border px-3 text-left text-sm', form.gstBearer === b ? 'border-orange-500 bg-white ring-2 ring-orange-400' : 'border-orange-200 bg-white')}
                  >
                    <span className="font-semibold">{b === 'CUSTOMER' ? 'Visitor pays GST (added on top)' : 'Mandal bears GST (price includes GST)'}</span>
                    <span className="text-xs text-slate-500">{example}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">Requires your GSTIN in “Payouts &amp; bank”. Each paid order gets a tax invoice. Confirm the applicable rate with your CA.</p>
          </>
        )}
      </div>
      <Field label="Default pass print format">
        <PrintFormatPicker value={form.passPrintFormat} onChange={(v) => setForm((x) => ({ ...x, passPrintFormat: v }))} />
      </Field>
      <Field label="Pass durations the token desk can issue" hint="Admins can always issue any duration. Leave all off to allow only time-slot passes at the desk.">
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((h) => {
            const on = form.tokenDurationOptions.includes(h);
            return (
              <button
                key={h}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setForm((x) => ({
                    ...x,
                    tokenDurationOptions: on ? x.tokenDurationOptions.filter((d) => d !== h) : [...x.tokenDurationOptions, h].sort((a, b) => a - b),
                  }))
                }
                className={cx(
                  'min-h-[44px] rounded-full px-4 text-sm font-semibold transition-colors',
                  on ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow' : 'bg-white text-slate-700 ring-1 ring-orange-200 hover:bg-orange-50',
                )}
              >
                {durationLabel(h)}
              </button>
            );
          })}
        </div>
      </Field>
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">Saved.</Alert>}
      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** "18.52, 73.85" → [lat, lng]; null when blank or out of range. */
function parseCoords(v: string): [number, number] | null {
  const m = v.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
