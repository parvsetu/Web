'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Clock, Minus, Plus } from 'lucide-react';
import { fmtMoney } from '@/lib/format';
import { dayParts, fmtHHmm, isFree } from '@/lib/booking';
import type { AvailabilitySlot } from '@/lib/booking-types';
import type { FestivalTheme } from '@/lib/festival-theme';
import { cx } from '../ui';

export function Step({ n, title, hint, children, id, theme }: { n: number; title: string; hint?: ReactNode; children: ReactNode; id?: string; theme: FestivalTheme }) {
  return (
    <section id={id} aria-labelledby={`${id ?? `step-${n}`}-title`} className="scroll-mt-20 rounded-3xl border border-orange-100 bg-white p-4 shadow-sm shadow-orange-900/5">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-white shadow"
          style={{ background: theme.via }}
        >
          {n}
        </span>
        <div className="min-w-0">
          <h2 id={`${id ?? `step-${n}`}-title`} className="text-lg font-bold leading-tight text-slate-900">
            {title}
          </h2>
          {hint && <p className="text-sm text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function DateChips({
  days,
  today,
  value,
  onChange,
  theme,
}: {
  days: string[];
  today: string;
  value: string;
  onChange: (d: string) => void;
  theme: FestivalTheme;
}) {
  return (
    <div role="radiogroup" aria-label="Festival day" className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 pt-2.5 [scrollbar-width:none]">
      {days.map((d) => {
        const p = dayParts(d);
        const past = d < today;
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${p.weekday} ${p.day} ${p.month}${d === today ? ', today' : ''}${past ? ', past' : ''}`}
            disabled={past}
            onClick={() => onChange(d)}
            className={cx(
              'relative flex min-h-[76px] w-[68px] shrink-0 snap-start flex-col items-center justify-center rounded-2xl border-2 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30',
              selected ? 'text-white shadow-md' : 'border-orange-100 bg-white text-slate-800 hover:border-orange-300',
              past && 'cursor-not-allowed border-dashed bg-slate-50 text-slate-300 hover:border-orange-100',
            )}
            style={selected ? { background: theme.via, borderColor: theme.via } : undefined}
          >
            <span className={cx('text-[11px] font-bold uppercase tracking-wide', selected ? 'text-white/90' : past ? '' : 'text-slate-500')}>{p.weekday}</span>
            <span className="text-2xl font-extrabold leading-none">{p.day}</span>
            <span className={cx('text-xs font-semibold', selected ? 'text-white/90' : past ? '' : 'text-slate-500')}>{p.month}</span>
            {d === today && (
              <span
                className={cx(
                  'absolute -top-2 rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide',
                  selected ? 'bg-white text-orange-700 shadow' : 'bg-amber-400 text-amber-950',
                )}
              >
                Today
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type SlotState = 'open' | 'low' | 'soldout' | 'ended' | 'nopay';

export function slotState(s: AvailabilitySlot, onlinePayments: boolean): SlotState {
  if (s.ended) return 'ended';
  if (s.remaining !== null && s.remaining <= 0) return 'soldout';
  if (!isFree(s.price) && !onlinePayments) return 'nopay';
  if (s.remaining !== null && s.remaining < 10) return 'low';
  return 'open';
}

export function SlotCard({
  slot,
  state,
  selected,
  onSelect,
  theme,
}: {
  slot: AvailabilitySlot;
  state: SlotState;
  selected: boolean;
  onSelect: () => void;
  theme: FestivalTheme;
}) {
  const disabled = state === 'ended' || state === 'soldout' || state === 'nopay';
  const free = isFree(slot.price);
  const note =
    state === 'ended'
      ? 'Ended'
      : state === 'soldout'
        ? 'Sold out'
        : state === 'nopay'
          ? 'Online payment unavailable'
          : state === 'low'
            ? `Only ${slot.remaining} left`
            : slot.remaining === null
              ? 'Places available'
              : `${slot.remaining} places left`;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'flex min-h-[72px] w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30',
        selected ? 'shadow-md' : 'border-orange-100 bg-white hover:border-orange-300',
        disabled && 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-70 hover:border-slate-100',
      )}
      style={selected ? { borderColor: theme.via, background: theme.soft } : undefined}
    >
      <span
        aria-hidden
        className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-transparent text-white' : 'border-slate-300')}
        style={selected ? { background: theme.via } : undefined}
      >
        {selected && <CheckCircle2 className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block font-bold', disabled ? 'text-slate-500' : 'text-slate-900')}>{slot.label}</span>
        <span className="mt-0.5 flex items-center gap-1 text-sm text-slate-600">
          <Clock aria-hidden className="h-3.5 w-3.5 text-slate-400" />
          {fmtHHmm(slot.startTime)} – {fmtHHmm(slot.endTime)}
        </span>
        <span
          className={cx(
            'mt-1 inline-block text-xs font-semibold',
            state === 'low' && 'rounded-full bg-amber-100 px-2 py-0.5 text-amber-800',
            state === 'open' && 'text-emerald-700',
            (state === 'soldout' || state === 'ended' || state === 'nopay') && 'text-slate-500',
          )}
        >
          {note}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cx('block text-lg font-extrabold', free ? 'text-emerald-700' : disabled ? 'text-slate-400' : 'text-slate-900')}>
          {free ? 'Free' : fmtMoney(slot.price)}
        </span>
        {!free && <span className="block text-xs text-slate-500">per person</span>}
      </span>
    </button>
  );
}

export function PeopleStepper({ value, max, onChange, theme }: { value: number; max: number; onChange: (n: number) => void; theme: FestivalTheme }) {
  const m = Math.max(1, max);
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label="Fewer people"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-orange-200 bg-white text-slate-800 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus aria-hidden className="h-6 w-6" />
      </button>
      <output aria-live="polite" aria-label="Number of people" className="min-w-[64px] text-center">
        <span className="block text-4xl font-extrabold leading-none" style={{ color: theme.ink }}>
          {value}
        </span>
        <span className="text-xs font-semibold text-slate-500">{value === 1 ? 'person' : 'people'}</span>
      </output>
      <button
        type="button"
        aria-label="More people"
        onClick={() => onChange(Math.min(m, value + 1))}
        disabled={value >= m}
        className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: theme.via }}
      >
        <Plus aria-hidden className="h-6 w-6" />
      </button>
    </div>
  );
}
