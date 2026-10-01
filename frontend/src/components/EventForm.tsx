'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { DEFAULT_TZ, DURATION_PRESETS, durationLabel, humanize } from '@/lib/format';
import type { EventBody, EventDetail, EventStatus } from '@/lib/types';
import { FestivalBadge } from './FestivalBanner';
import { Alert, Button, Checkbox, Field, LabeledInput, LabeledSelect, Textarea, cx } from './ui';
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
}: {
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
    gstBearer: (initial?.gstBearer ?? 'CUSTOMER') as 'CUSTOMER' | 'MANDAL',
    gstSac: initial?.gstSac ?? '9996',
    passPrintFormat: (initial?.passPrintFormat ?? 'A4') as PrintFormat,
  });
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
      gstBearer: form.gstBearer,
      gstSac: form.gstSac.trim() || '9996',
      passPrintFormat: form.passPrintFormat,
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
          <FestivalTypeSelect value={form.festivalType} onChange={(v) => setForm((x) => ({ ...x, festivalType: v }))} />
        </div>
        <FestivalBadge type={form.festivalType || null} className="h-14 w-14" />
      </div>
      {types.error && <Alert kind="warning">Could not load festival types: {types.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Start date" type="date" value={form.startDate} onChange={set('startDate')} />
        <LabeledInput label="End date" type="date" value={form.endDate} onChange={set('endDate')} />
      </div>
      <StateCityPicker state={form.state} city={form.city} onChange={(p) => setForm((x) => ({ ...x, ...p }))} />
      <LabeledInput label="Venue / pandal address" value={form.location} onChange={set('location')} placeholder="e.g. Salt Lake Sector 1, near FD Park" />
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
            <div className="grid grid-cols-2 gap-3">
              <LabeledSelect label="GST rate" value={form.gstRatePercent} onChange={set('gstRatePercent')}>
                {[0, 5, 12, 18, 28].map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </LabeledSelect>
              <LabeledInput label="SAC / HSN code" value={form.gstSac} onChange={set('gstSac')} inputMode="numeric" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Who pays GST">
              {(['CUSTOMER', 'MANDAL'] as const).map((b) => {
                const r = Number(form.gstRatePercent) || 0;
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
