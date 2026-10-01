'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { DEFAULT_TZ, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import type { EventBody, EventDetail, EventStatus, FestivalType } from '@/lib/types';
import { FestivalBadge } from './FestivalBanner';
import { Alert, Button, Checkbox, Field, LabeledInput, LabeledSelect, Textarea } from './ui';

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
  const types = useAsync(() => api.get<FestivalType[]>('/public/festival-types'), []);
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
    maxVisitorsPerToken: String(initial?.maxVisitorsPerToken ?? 10),
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
      maxVisitorsPerToken: max,
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
        <LabeledSelect label="Festival type" value={form.festivalType} onChange={set('festivalType')}>
          <option value="">— Choose —</option>
          {(types.data ?? []).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
          {form.festivalType && !types.data?.some((t) => t.key === form.festivalType) && <option value={form.festivalType}>{humanize(form.festivalType)}</option>}
        </LabeledSelect>
        </div>
        <FestivalBadge type={form.festivalType || null} className="h-14 w-14" />
      </div>
      {types.error && <Alert kind="warning">Could not load festival types: {types.error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <LabeledInput label="Start date" type="date" value={form.startDate} onChange={set('startDate')} />
        <LabeledInput label="End date" type="date" value={form.endDate} onChange={set('endDate')} />
      </div>
      <LabeledInput label="Location" value={form.location} onChange={set('location')} />
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
      {error && <Alert>{error}</Alert>}
      {ok && <Alert kind="success">Saved.</Alert>}
      <Button type="submit" loading={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
