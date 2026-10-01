'use client';

import { useEffect, useState } from 'react';
import { saveBlob } from '@/lib/api';
import { clampDate, fmtDate, fmtDateTime, localInputToIso, nowHHmmIn, todayIn } from '@/lib/format';
import type { TimeSlot, TokenWithQr, Validity } from '@/lib/types';
import { QrImage, qrCardPng } from './QrImage';
import { Badge, Button, Field, Input, LabeledInput, Select, cx } from './ui';

export interface ValidityState {
  mode: 'slot' | 'custom';
  timeSlotId: string;
  date: string;
  validFrom: string; // datetime-local
  validUntil: string;
}

/** A slot's window has already ended if `date` is today (event tz) and its end time has passed. UI hint only. */
export function slotEnded(slot: TimeSlot, date: string, tz: string): boolean {
  if (date !== todayIn(tz) || slot.crossesMidnight) return false;
  return slot.endTime <= nowHHmmIn(tz);
}

export function initialValidity(slots: TimeSlot[], startDate: string, endDate: string, tz: string): ValidityState {
  const today = todayIn(tz);
  const date = startDate && endDate ? clampDate(today, startDate, endDate) : today;
  const active = [...slots].filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));
  const first = active.find((s) => !slotEnded(s, date, tz)) ?? active[0];
  return { mode: 'slot', timeSlotId: first?.id ?? '', date, validFrom: '', validUntil: '' };
}

/** Returns the API validity object, or an error string. */
export function buildValidity(v: ValidityState): Validity | string {
  if (v.mode === 'slot') {
    if (!v.timeSlotId) return 'Choose a time slot.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Choose a date.';
    return { timeSlotId: v.timeSlotId, date: v.date };
  }
  if (!v.validFrom || !v.validUntil) return 'Enter both start and end time.';
  const from = localInputToIso(v.validFrom);
  const until = localInputToIso(v.validUntil);
  if (new Date(until) <= new Date(from)) return 'End time must be after start time.';
  return { validFrom: from, validUntil: until };
}

export function ValidityPicker({
  value,
  onChange,
  slots,
  allowCustom,
  startDate,
  endDate,
  tz,
}: {
  value: ValidityState;
  onChange: (v: ValidityState) => void;
  slots: TimeSlot[];
  allowCustom: boolean;
  startDate: string;
  endDate: string;
  tz: string;
}) {
  const active = slots.filter((s) => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));
  const set = (patch: Partial<ValidityState>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      {allowCustom && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Validity type">
          {(['slot', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={value.mode === m}
              onClick={() => set({ mode: m })}
              className={cx(
                'min-h-[48px] rounded-xl border text-sm font-semibold',
                value.mode === m ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white',
              )}
            >
              {m === 'slot' ? 'Time slot' : 'Custom time'}
            </button>
          ))}
        </div>
      )}
      {value.mode === 'slot' ? (
        <>
          {active.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              No active time slots. An organiser must add a slot first{allowCustom ? ', or use Custom time.' : '.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Time slot">
              <span className="text-sm font-semibold text-slate-800">Time slot</span>
              {active.map((s) => {
                const ended = slotEnded(s, value.date, tz);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={value.timeSlotId === s.id}
                    onClick={() => set({ timeSlotId: s.id })}
                    className={cx(
                      'flex min-h-[52px] items-center justify-between rounded-xl border px-4 text-left',
                      value.timeSlotId === s.id ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-500' : 'border-slate-300 bg-white',
                      ended && 'opacity-50',
                    )}
                  >
                    <span className="font-semibold">
                      {s.label}
                      {ended && <span className="ml-2 text-xs font-normal text-slate-500">(ended today)</span>}
                    </span>
                    <span className="text-sm text-slate-600">
                      {s.startTime}–{s.endTime}
                      {s.crossesMidnight && ' (+1 day)'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <LabeledInput
            label="Date"
            type="date"
            value={value.date}
            min={startDate ? startDate.slice(0, 10) : undefined}
            max={endDate ? endDate.slice(0, 10) : undefined}
            onChange={(e) => set({ date: e.target.value })}
            hint={startDate ? `Festival: ${fmtDate(startDate)} – ${fmtDate(endDate)}` : undefined}
          />
        </>
      ) : (
        <>
          <LabeledInput label="Valid from" type="datetime-local" value={value.validFrom} onChange={(e) => set({ validFrom: e.target.value })} hint="Your device's local time" />
          <LabeledInput label="Valid until" type="datetime-local" value={value.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
        </>
      )}
    </div>
  );
}

export function VisitorCountInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const m = Math.max(1, max || 1);
  return (
    <Field label="Number of people" hint={`1 to ${m}`}>
      <div className="flex items-center gap-2">
        <Button variant="secondary" aria-label="Fewer" className="w-14 text-2xl" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1}>
          −
        </Button>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={m}
          value={value}
          onChange={(e) => onChange(Math.min(m, Math.max(1, Number(e.target.value) || 1)))}
          className="text-center text-xl font-bold"
        />
        <Button variant="secondary" aria-label="More" className="w-14 text-2xl" onClick={() => onChange(Math.min(m, value + 1))} disabled={value >= m}>
          +
        </Button>
      </div>
    </Field>
  );
}

export function SlotSelect({ slots, value, onChange, label = 'Slot' }: { slots: TimeSlot[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All slots</option>
        {slots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Large printable token: QR + code + validity. */
export function TokenTicket({ token, eventName, tz }: { token: TokenWithQr; eventName: string; tz: string }) {
  return (
    <div className="print-break-inside-avoid flex flex-col items-center gap-2 rounded-3xl border-2 border-slate-900 bg-white p-4 text-center">
      <div className="text-sm font-semibold uppercase tracking-wide text-slate-600">{eventName}</div>
      <QrImage payload={token.qrPayload} size={300} alt={`QR for ${token.tokenCode}`} />
      <div className="font-mono text-2xl font-bold tracking-wider">{token.tokenCode}</div>
      {token.timeSlot && <div className="text-base font-semibold">{token.timeSlot.label}</div>}
      <div className="text-sm text-slate-700">
        Valid {fmtDateTime(token.validFrom, tz)} – {fmtDateTime(token.validUntil, tz)}
      </div>
      <div className="text-sm text-slate-700">
        {token.visitorCount > 1 ? `Admits ${token.visitorCount} people` : 'Admits 1 person'}
        {token.visitor?.name ? ` · ${token.visitor.name}` : ''}
      </div>
      <div className="no-print">
        <Badge value={token.effectiveStatus} />
      </div>
      <div className="text-xs text-slate-500">One-time entry. Do not share this QR.</div>
    </div>
  );
}

export function TokenShareButtons({ token, eventName, tz, showPrint = true }: { token: TokenWithQr; eventName: string; tz: string; showPrint?: boolean }) {
  const [canShare, setCanShare] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  async function makeFile(): Promise<File> {
    const blob = await qrCardPng(token.qrPayload, [
      token.tokenCode,
      eventName,
      `${fmtDateTime(token.validFrom, tz)} – ${fmtDateTime(token.validUntil, tz)}`,
      token.visitorCount > 1 ? `Admits ${token.visitorCount} people` : 'Admits 1 person',
    ]);
    return new File([blob], `${token.tokenCode}.png`, { type: 'image/png' });
  }

  async function share() {
    setMsg(null);
    try {
      const file = await makeFile();
      const data: ShareData = { files: [file], title: token.tokenCode, text: `${eventName} entry token ${token.tokenCode}` };
      if (navigator.canShare && !navigator.canShare(data)) {
        saveBlob(file, file.name);
        return;
      }
      await navigator.share(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setMsg('Sharing failed. Use Download instead.');
    }
  }

  async function download() {
    setMsg(null);
    try {
      const file = await makeFile();
      saveBlob(file, file.name);
    } catch {
      setMsg('Could not create the image.');
    }
  }

  return (
    <div className="no-print flex flex-col gap-2">
      <div className={cx('grid gap-2', showPrint ? 'grid-cols-2' : 'grid-cols-1')}>
        {showPrint && (
          <Button variant="secondary" onClick={() => window.print()}>
            Print
          </Button>
        )}
        {canShare ? (
          <Button variant="secondary" onClick={share}>
            Share
          </Button>
        ) : (
          <Button variant="secondary" onClick={download}>
            Download PNG
          </Button>
        )}
      </div>
      {canShare && (
        <Button variant="ghost" size="sm" onClick={download}>
          Download PNG
        </Button>
      )}
      {msg && <p className="text-center text-sm text-red-700">{msg}</p>}
    </div>
  );
}
