'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Search } from 'lucide-react';
import { booking } from '@/lib/booking';
import type { BookableEvent } from '@/lib/booking-types';
import { fmtDate } from '@/lib/format';
import { FestivalBadge } from '../FestivalBanner';
import { Alert, Input, SkeletonList, cx } from '../ui';

/**
 * Pick festivals to promote — the live festivals taking online bookings (the
 * only place a referral can earn). The server re-checks every pick.
 */
export function FestivalPicker({ selected, onChange, max = 10, exclude = [] }: { selected: string[]; onChange: (ids: string[]) => void; max?: number; exclude?: string[] }) {
  const [events, setEvents] = useState<BookableEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    booking.events({}).then(setEvents).catch((e) => setError(e instanceof Error ? e.message : 'Could not load festivals.'));
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (events ?? [])
      .filter((e) => !exclude.includes(e.id))
      .filter((e) => !t || [e.name, e.organization.name, e.city ?? ''].some((s) => s.toLowerCase().includes(t)));
  }, [events, q, exclude]);

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= max ? selected : [...selected, id]);

  if (error) return <Alert>{error}</Alert>;
  if (!events) return <SkeletonList rows={2} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search festival, mandal or city" className="pl-9" aria-label="Search festivals" />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No festivals taking online bookings match.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1" role="listbox" aria-multiselectable="true" aria-label="Festivals">
          {shown.map((e) => {
            const on = selected.includes(e.id);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(e.id)}
                  className={cx('flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition', on ? 'border-fuchsia-400 bg-fuchsia-50 ring-1 ring-fuchsia-300' : 'border-slate-200 bg-white hover:bg-slate-50')}
                >
                  <FestivalBadge type={e.festivalType} className="h-9 w-9 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-slate-900">{e.name}</span>
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)} · {e.organization.name}{e.city ? `, ${e.city}` : ''}
                    </span>
                  </span>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', on ? 'border-fuchsia-600 bg-fuchsia-600 text-white' : 'border-slate-300')}>
                    {on && <Check aria-hidden className="h-4 w-4" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-slate-500">{selected.length} of up to {max} selected. Each festival is approved separately.</p>
    </div>
  );
}
