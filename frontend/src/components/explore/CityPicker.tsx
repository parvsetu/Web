'use client';

import { useMemo, useState } from 'react';
import { Check, Globe2, LocateFixed, Search, Sparkles } from 'lucide-react';
import { Modal } from '../ui';
import { cx } from '@/lib/cx';
import type { MessageKey } from '@/lib/i18n/core';
import { useT } from '@/lib/i18n/provider';
import { CITY_CARDS, CityPostcard, cityCard, nearestCity, type CityCard } from './CityLandmarks';

/**
 * City chooser styled as a rack of postcards — each popular city drawn with
 * its own landmark. Cities with live events float to the top; search covers
 * every city in India; "Use my location" picks the nearest known city.
 */
export function CityPicker({
  open,
  onClose,
  current,
  counts,
  allCities,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
  /** Bookable-event count per city (lower-cased key). */
  counts: Map<string, number>;
  allCities: { state: string; cities: string[] }[];
  onPick: (city: string) => void;
}) {
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const { t: tr, city: cityName } = useT();
  const landmark = (c: CityCard) => tr(`city.${c.name}.landmark` as MessageKey);
  const tagline = (c: CityCard) => tr(`city.${c.name}.tagline` as MessageKey);
  const postcardLabel = (c: CityCard | null | undefined) => (c ? `${landmark(c)}, ${cityName(c.name)}` : tr('picker.skyline'));
  const t = q.trim().toLowerCase();
  const n = (c: string) => counts.get(c.toLowerCase()) ?? 0;

  // Postcards: popular cities, those with events first. Cities with events but
  // no drawing yet still get a (skyline) card so nothing live is hidden.
  const cards = useMemo(() => {
    const known = new Set(CITY_CARDS.map((c) => c.name.toLowerCase()));
    const names = new Map(allCities.flatMap((s) => s.cities).map((c) => [c.toLowerCase(), c]));
    const extra = [...counts.keys()].filter((c) => !known.has(c)).map((c) => names.get(c) ?? c.replace(/\b\w/g, (m) => m.toUpperCase()));
    const list: { name: string; card: CityCard | null }[] = [...CITY_CARDS.map((c) => ({ name: c.name, card: c })), ...extra.map((name) => ({ name, card: null }))];
    return list.sort((a, b) => n(b.name) - n(a.name) || CITY_CARDS.findIndex((c) => c.name === a.name) - CITY_CARDS.findIndex((c) => c.name === b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counts, allCities]);

  const matches = useMemo(
    () => (t ? allCities.flatMap((s) => s.cities.filter((c) => c.toLowerCase().includes(t) || cityName(c).toLowerCase().includes(t)).map((c) => ({ c, s: s.state }))).slice(0, 40) : []),
    [t, allCities, cityName],
  );

  function locate() {
    setLocError(null);
    if (!navigator.geolocation) return setLocError(tr('picker.noGeo'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const c = nearestCity(p.coords.latitude, p.coords.longitude);
        if (c) onPick(c.name);
        else setLocError(tr('picker.noNearby'));
      },
      () => {
        setLocating(false);
        setLocError(tr('picker.blocked'));
      },
      { timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={tr('picker.title')} wide>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block flex-1">
            <span className="sr-only">{tr('picker.searchLabel')}</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr('picker.searchPlaceholder')}
              className="h-12 w-full rounded-xl border border-slate-200 pl-11 pr-3 outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
          </label>
          <button
            type="button"
            onClick={locate}
            disabled={locating}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 px-4 font-semibold text-white shadow-md disabled:opacity-70"
          >
            <LocateFixed aria-hidden className={cx('h-5 w-5', locating && 'animate-spin')} /> {locating ? tr('picker.finding') : tr('picker.useLocation')}
          </button>
        </div>
        {locError && <p className="-mt-2 text-sm text-amber-700">{locError}</p>}

        {t ? (
          matches.length ? (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
              {matches.map(({ c, s }) => {
                const card = cityCard(c);
                return (
                  <li key={`${s}-${c}`}>
                    <button type="button" onClick={() => onPick(c)} className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left hover:bg-rose-50">
                      <CityPostcard city={card ?? null} label={postcardLabel(card)} className="h-10 w-14 shrink-0 rounded-lg" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{cityName(c)}</span>
                        <span className="block text-xs text-slate-500">{s}</span>
                      </span>
                      {n(c) > 0 && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{tr('picker.live', { n: n(c) })}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-slate-500">{tr('picker.noMatch', { q: q.trim() })}</p>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => onPick('')}
              className={cx(
                'group relative flex min-h-[64px] items-center gap-3 overflow-hidden rounded-2xl px-4 text-left font-semibold text-white shadow-md',
                'bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500',
              )}
            >
              <span aria-hidden className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
              <Globe2 aria-hidden className="h-7 w-7 shrink-0" />
              <span className="flex-1">
                <span className="block">{tr('picker.allIndia')}</span>
                <span className="block text-xs font-normal text-white/85">{tr('picker.allIndiaSub')}</span>
              </span>
              {!current && <Check aria-hidden className="h-5 w-5" />}
            </button>

            <div>
              <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                <Sparkles aria-hidden className="h-3.5 w-3.5 text-amber-500" /> {tr('picker.popular')}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {cards.map(({ name, card }, i) => {
                  const count = n(name);
                  const active = current.toLowerCase() === name.toLowerCase();
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onPick(name)}
                      aria-pressed={active}
                      className={cx(
                        'group relative overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-300',
                        active ? 'ring-2 ring-rose-500' : 'ring-slate-200',
                        // Slight alternating tilt — a rack of postcards, straightened on hover.
                        i % 3 === 0 ? 'sm:-rotate-1' : i % 3 === 1 ? 'sm:rotate-1' : '',
                        'hover:rotate-0',
                      )}
                    >
                      <div className="relative">
                        <CityPostcard city={card} label={postcardLabel(card)} className="block aspect-[3/2] w-full transition duration-300 group-hover:scale-105" />
                        {count > 0 ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {tr('picker.live', { n: count })}
                          </span>
                        ) : (
                          <span className="absolute left-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{tr('picker.comingSoon')}</span>
                        )}
                        {active && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow">
                            <Check aria-hidden className="h-4 w-4" />
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2">
                        <span className="block truncate font-extrabold text-slate-900">{cityName(name)}</span>
                        <span className="block truncate text-xs font-medium text-slate-600">{card ? landmark(card) : tr('picker.eventsLive')}</span>
                        {card && <span className="block truncate text-[11px] italic text-slate-400">{tagline(card)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-center text-xs text-slate-500">{tr('picker.footer')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}
