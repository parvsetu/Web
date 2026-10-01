'use client';

import { useMemo, useState } from 'react';
import { CalendarRange, Flame, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { TimeSlot } from '@/lib/types';
import { cx } from '@/lib/cx';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, Modal, SectionTitle, SkeletonList } from '../ui';

export interface PriceRule {
  id: string;
  label: string;
  kind: 'DATES' | 'WEEKENDS';
  dates: string[];
  timeSlotIds: string[];
  fixedPrice: string | null;
  upliftPercent: number | null;
  isActive: boolean;
}

interface Preview {
  days: { date: string; weekend: boolean; slots: { slotId: string; label: string; basePrice: string; price: string; ruleLabel: string | null }[] }[];
  truncated: boolean;
}

function eventDays(start: string, end: string) {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < 400 && d.toISOString().slice(0, 10) <= end; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });

/**
 * Peak-day pricing: date-based price overrides on top of slot prices.
 * Explicit dates beat weekend rules; among matching rules the highest price wins.
 */
export function PeakPricingSection({ slots }: { slots: TimeSlot[] }) {
  const ev = useEvent();
  const rules = useAsync(() => api.get<PriceRule[]>(`/events/${ev.eventId}/price-rules`), [ev.eventId]);
  const preview = useAsync(() => api.get<Preview>(`/events/${ev.eventId}/price-rules/preview`), [ev.eventId]);
  const [editing, setEditing] = useState<PriceRule | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => {
    rules.reload();
    preview.reload();
  };
  const slotName = (id: string) => slots.find((s) => s.id === id)?.label ?? 'removed slot';

  async function remove(r: PriceRule) {
    if (!window.confirm(`Delete the price rule "${r.label}"? Bookings already paid keep their price.`)) return;
    setError(null);
    try {
      await api.del(`/events/${ev.eventId}/price-rules/${r.id}`);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="mt-2 flex flex-col gap-3">
      <SectionTitle icon={Flame} action={<Button size="sm" onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add rule</Button>}>
        Peak pricing
      </SectionTitle>
      <p className="-mt-2 text-sm text-slate-600">
        Charge more on busy days — e.g. weekends +20% or Ashtami at a fixed price. Specific dates win over weekend rules; if several rules match, the highest price applies.
        Visitors see the peak price (with the normal price struck through) when they pick that day.
      </p>
      {error && <Alert>{error}</Alert>}
      {rules.error && <Alert>{rules.error}</Alert>}
      {rules.loading && !rules.data ? (
        <SkeletonList rows={1} />
      ) : (rules.data ?? []).length === 0 ? (
        <Empty title="No peak pricing" icon={Flame}>Every day uses the slot prices above.</Empty>
      ) : (
        (rules.data ?? []).map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{r.label}</span>
                <Badge className="bg-rose-100 text-rose-800">{r.fixedPrice !== null ? fmtMoney(r.fixedPrice) : `+${r.upliftPercent}%`}</Badge>
                {!r.isActive && <Badge value="INACTIVE" />}
              </div>
              <p className="text-sm text-slate-600">
                {r.kind === 'WEEKENDS' ? 'Every Saturday & Sunday' : r.dates.map(fmtDate).join(', ')} · {r.timeSlotIds.length ? r.timeSlotIds.map(slotName).join(', ') : 'all slots'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(r)}><Pencil aria-hidden className="h-4 w-4" /> Edit</Button>
              <Button variant="ghost" size="sm" className="text-red-700" onClick={() => void remove(r)}><Trash2 aria-hidden className="h-4 w-4" /> Delete</Button>
            </div>
          </Card>
        ))
      )}
      {preview.data && (rules.data ?? []).length > 0 && <PriceCalendar p={preview.data} />}
      {editing && (
        <RuleForm
          rule={editing === 'new' ? null : editing}
          slots={slots}
          days={eventDays(ev.startDate, ev.endDate)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </section>
  );
}

/** Day-by-day price per slot, peak cells highlighted. */
function PriceCalendar({ p }: { p: Preview }) {
  const slots = p.days[0]?.slots ?? [];
  return (
    <Card>
      <h3 className="mb-2 flex items-center gap-2 font-bold"><CalendarRange aria-hidden className="h-4 w-4 text-orange-500" /> Price preview</h3>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[420px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white px-2 py-1 text-left text-xs font-bold uppercase text-slate-500">Day</th>
              {slots.map((s) => <th key={s.slotId} className="px-2 py-1 text-right text-xs font-bold uppercase text-slate-500">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {p.days.map((d) => (
              <tr key={d.date}>
                <td className={cx('sticky left-0 whitespace-nowrap border-t border-orange-50 bg-white px-2 py-1.5 font-semibold', d.weekend && 'text-rose-700')}>
                  {weekday(d.date)} {fmtDate(d.date)}
                </td>
                {d.slots.map((s) => {
                  const up = Number(s.price) !== Number(s.basePrice);
                  return (
                    <td key={s.slotId} className={cx('whitespace-nowrap border-t border-orange-50 px-2 py-1.5 text-right tabular-nums', up && 'bg-rose-50 font-bold text-rose-800')} title={s.ruleLabel ?? undefined}>
                      {up && <span className="mr-1 text-xs font-normal text-slate-400 line-through">{fmtMoney(s.basePrice)}</span>}
                      {Number(s.price) === 0 ? 'Free' : fmtMoney(s.price)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.truncated && <p className="mt-2 text-xs text-slate-500">Showing the first 120 days.</p>}
    </Card>
  );
}

function RuleForm({ rule, slots, days, onClose, onSaved }: { rule: PriceRule | null; slots: TimeSlot[]; days: string[]; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const [label, setLabel] = useState(rule?.label ?? '');
  const [kind, setKind] = useState<'DATES' | 'WEEKENDS'>(rule?.kind ?? 'DATES');
  const [dates, setDates] = useState<string[]>(rule?.dates ?? []);
  const [allSlots, setAllSlots] = useState(!rule || rule.timeSlotIds.length === 0);
  const [slotIds, setSlotIds] = useState<string[]>(rule?.timeSlotIds ?? []);
  const [mode, setMode] = useState<'PERCENT' | 'FIXED'>(rule?.fixedPrice != null ? 'FIXED' : 'PERCENT');
  const [percent, setPercent] = useState(rule?.upliftPercent != null ? String(rule.upliftPercent) : '20');
  const [fixed, setFixed] = useState(rule?.fixedPrice ?? '');
  const [active, setActive] = useState(rule?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasWeekend = useMemo(() => days.some((d) => ['Sat', 'Sun'].includes(weekday(d))), [days]);

  async function save() {
    setError(null);
    if (!label.trim()) return setError('Give the rule a name, e.g. “Ashtami peak”.');
    if (kind === 'DATES' && !dates.length) return setError('Pick at least one date.');
    if (!allSlots && !slotIds.length) return setError('Pick at least one slot, or choose all slots.');
    const body = {
      label: label.trim(), kind, dates: kind === 'DATES' ? dates : [], timeSlotIds: allSlots ? [] : slotIds, isActive: active,
      ...(mode === 'FIXED' ? { fixedPrice: fixed, upliftPercent: null } : { upliftPercent: Number(percent), fixedPrice: null }),
    };
    setBusy(true);
    try {
      if (rule) await api.patch(`/events/${ev.eventId}/price-rules/${rule.id}`, body);
      else await api.post(`/events/${ev.eventId}/price-rules`, body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v].sort());
  const pill = (on: boolean) => cx('min-h-[44px] rounded-full px-4 text-sm font-semibold', on ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white' : 'bg-white ring-1 ring-orange-200');

  return (
    <Modal open onClose={onClose} title={rule ? 'Edit price rule' : 'New price rule'} wide>
      <div className="flex flex-col gap-4">
        <LabeledInput label="Name" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ashtami peak, Weekend rush" />
        <Field label="Which days?">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pill(kind === 'DATES')} onClick={() => setKind('DATES')}>Pick dates</button>
            <button type="button" className={pill(kind === 'WEEKENDS')} onClick={() => setKind('WEEKENDS')} disabled={!hasWeekend}>Every weekend</button>
          </div>
        </Field>
        {kind === 'DATES' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Festival dates">
            {days.map((d) => (
              <button key={d} type="button" aria-pressed={dates.includes(d)} onClick={() => toggle(dates, setDates, d)}
                className={cx('flex min-h-[52px] w-[62px] flex-col items-center justify-center rounded-xl border-2 text-xs font-semibold', dates.includes(d) ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-orange-100 bg-white')}>
                <span className="uppercase text-slate-500">{weekday(d)}</span>
                <span className="text-base font-extrabold">{Number(d.slice(8))}</span>
                <span>{new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' })}</span>
              </button>
            ))}
          </div>
        )}
        <Field label="Which slots?">
          <Checkbox label="All time slots" checked={allSlots} onChange={setAllSlots} />
          {!allSlots && (
            <div className="flex flex-col">
              {slots.map((s) => <Checkbox key={s.id} label={`${s.label} (${Number(s.price ?? 0) > 0 ? fmtMoney(s.price) : 'Free'})`} checked={slotIds.includes(s.id)} onChange={() => toggle(slotIds, setSlotIds, s.id)} />)}
            </div>
          )}
        </Field>
        <Field label="Price on these days">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pill(mode === 'PERCENT')} onClick={() => setMode('PERCENT')}>+ Percentage</button>
            <button type="button" className={pill(mode === 'FIXED')} onClick={() => setMode('FIXED')}>Fixed price</button>
          </div>
        </Field>
        {mode === 'PERCENT' ? (
          <LabeledInput label="Increase by (%)" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ''))} hint={slots[0] && Number(slots[0].price) > 0 ? `${slots[0].label}: ${fmtMoney(slots[0].price)} → ${fmtMoney(Math.round(Number(slots[0].price) * (100 + Number(percent || 0))) / 100)}` : 'Free slots stay free with a percentage rule.'} />
        ) : (
          <LabeledInput label="Price per person (₹)" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 150" />
        )}
        <Checkbox label="Rule is active" checked={active} onChange={setActive} />
        {error && <Alert>{error}</Alert>}
        <Button loading={busy} onClick={() => void save()}>{rule ? 'Save rule' : 'Add rule'}</Button>
      </div>
    </Modal>
  );
}
