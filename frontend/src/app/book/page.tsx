'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MapPin, RotateCcw, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { ExploreShell } from '@/components/explore/ExploreShell';
import { EventRow, HeroCarousel, PosterCard } from '@/components/explore/Cards';
import { FestivalArt } from '@/components/FestivalArt';
import { Alert, Button, Empty, Modal, Skeleton } from '@/components/ui';
import { booking, bookingErrorMessage } from '@/lib/booking';
import { useFestivalTypes } from '@/lib/catalog';
import { cx } from '@/lib/cx';
import {
  CATEGORIES,
  DATE_FILTERS,
  PRICE_FILTERS,
  applyFilters,
  categoryOf,
  dateWindow,
  eventCity,
  isLive,
  loadCity,
  overlaps,
  saveCity,
  todayIst,
  type DateFilter,
  type ExploreFilters,
  type PriceFilter,
  type SortKey,
} from '@/lib/explore';
import type { BookableEvent, BookingLocation } from '@/lib/booking-types';

export default function BookPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Explore />
    </Suspense>
  );
}

function Explore() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f: ExploreFilters = {
    city: params.get('city') ?? '',
    q: params.get('q') ?? '',
    cat: params.get('cat') ?? '',
    date: (params.get('date') ?? '') as DateFilter,
    price: (params.get('price') ?? '') as PriceFilter,
    sort: (params.get('sort') ?? 'soon') as SortKey,
  };
  const listing = !!(f.q || f.cat || f.date || f.price || params.get('view') === 'all');

  const [search, setSearch] = useState(f.q);
  const [events, setEvents] = useState<BookableEvent[] | null>(null);
  const [locations, setLocations] = useState<BookingLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const types = useFestivalTypes();
  const groupOf = useMemo(() => new Map((types.data ?? []).map((t) => [t.key, t.group])), [types.data]);

  function setQuery(patch: Record<string, string>, push = false) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    const url = s ? `${pathname}?${s}` : pathname;
    if (push) router.push(url, { scroll: true });
    else router.replace(url, { scroll: false });
  }

  // Remembered city (first visit with no ?city= picks it up).
  useEffect(() => {
    if (params.has('city')) {
      if (f.city) saveCity(f.city);
      return;
    }
    const saved = loadCity();
    if (saved) setQuery({ city: saved });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce the search box into the URL.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => search.trim() !== f.q && setQuery({ q: search.trim() }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    booking.locations().then(setLocations).catch(() => setLocations([]));
  }, []);

  // One fetch of everything bookable; city/category/date/price filter in the browser.
  useEffect(() => {
    let alive = true;
    setError(null);
    booking
      .events({})
      .then((r) => alive && setEvents(r))
      .catch((e) => {
        if (!alive) return;
        setError(bookingErrorMessage(e));
        setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [reload]);

  const today = todayIst();
  const upcoming = useMemo(() => (events ?? []).filter((e) => e.endDate >= today), [events, today]);
  const cityCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of upcoming) {
      const c = eventCity(e).toLowerCase();
      if (c) m.set(c, (m.get(c) ?? 0) + 1);
    }
    return m;
  }, [upcoming]);
  const inCity = useMemo(() => upcoming.filter((e) => !f.city || eventCity(e).toLowerCase() === f.city.toLowerCase()), [upcoming, f.city]);
  const allCities = useMemo(() => locations.map((l) => ({ state: l.name, cities: l.cities })), [locations]);

  return (
    <ExploreShell
      city={f.city}
      onCity={(c) => {
        saveCity(c);
        setQuery({ city: c });
      }}
      q={search}
      onQ={setSearch}
      cat={f.cat}
      onCat={(c) => setQuery({ cat: c, view: c ? '' : params.get('view') ?? '' }, true)}
      cityCounts={cityCounts}
      allCities={allCities}
    >
      {error && (
        <Alert>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>{error}</span>
            <Button size="sm" variant="secondary" onClick={() => setReload((n) => n + 1)}>
              <RotateCcw aria-hidden className="h-4 w-4" /> Retry
            </Button>
          </div>
        </Alert>
      )}
      {events === null ? (
        <PageSkeleton bare />
      ) : listing ? (
        <Listing
          events={applyFilters(upcoming, f, groupOf, today)}
          f={f}
          setQuery={setQuery}
          clear={() => {
            setSearch('');
            setQuery({ q: '', cat: '', date: '', price: '', sort: '', view: '' });
          }}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
        />
      ) : (
        <Home events={inCity} groupOf={groupOf} city={f.city} today={today} setQuery={setQuery} />
      )}
    </ExploreShell>
  );
}

function Home({
  events,
  groupOf,
  city,
  today,
  setQuery,
}: {
  events: BookableEvent[];
  groupOf: Map<string, string>;
  city: string;
  today: string;
  setQuery: (p: Record<string, string>, push?: boolean) => void;
}) {
  if (!events.length) {
    return (
      <Empty title={city ? `No events in ${city} yet` : 'No events are taking bookings yet'} icon={MapPin}>
        {city ? 'Try another city, or look across all of India.' : 'Check back soon — organisers open bookings closer to the date.'}
        {city && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => setQuery({ city: '' })}>
              Show all cities
            </Button>
          </div>
        )}
      </Empty>
    );
  }
  const soonest = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const featured = [...soonest.filter((e) => isLive(e, today)), ...soonest.filter((e) => !isLive(e, today))].slice(0, 6);
  const weekend = soonest.filter((e) => overlaps(e, dateWindow('weekend', today)!));
  const free = soonest.filter((e) => e.fromPrice !== null && Number(e.fromPrice) === 0);
  const byCat = CATEGORIES.map((c) => ({ c, list: soonest.filter((e) => categoryOf(e.festivalType, groupOf) === c.key) })).filter((x) => x.list.length);
  const where = city ? ` in ${city}` : '';

  return (
    <div className="flex flex-col gap-9">
      <HeroCarousel events={featured} />

      <EventRow title={`Happening now${where}`} subtitle="Open today — book and walk in" events={soonest.filter((e) => isLive(e, today))} seeAll={() => setQuery({ date: 'today' }, true)} />
      <EventRow title="This weekend" events={weekend} seeAll={() => setQuery({ date: 'weekend' }, true)} />

      {byCat.length > 1 && (
        <section aria-label="Browse by category" className="flex flex-col gap-3">
          <h2 className="text-xl font-extrabold text-slate-900">Browse by category</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {byCat.map(({ c, list }) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setQuery({ cat: c.key }, true)}
                className="group relative flex min-h-[112px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-violet-600 p-3 text-left text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <span aria-hidden className="absolute -right-3 -top-3 h-20 w-20 rounded-full bg-white/90 p-3 shadow-lg">
                  <FestivalArt type={list[0].festivalType} className="h-full w-full" />
                </span>
                <span className="text-base font-extrabold leading-tight">{c.label}</span>
                <span className="text-xs text-white/85">{list.length} event{list.length === 1 ? '' : 's'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <EventRow title={`Coming up${where}`} events={soonest.filter((e) => e.startDate > today)} seeAll={() => setQuery({ view: 'all' }, true)} />
      <EventRow title="Free entry" subtitle="Register for a free pass" events={free} seeAll={() => setQuery({ price: 'free' }, true)} />
      {byCat.map(({ c, list }) => (
        <EventRow key={c.key} title={`${c.emoji} ${c.label}`} events={list} seeAll={() => setQuery({ cat: c.key }, true)} />
      ))}

      <div className="flex justify-center">
        <Button variant="secondary" onClick={() => setQuery({ view: 'all' }, true)}>
          Explore all {events.length} events{where}
        </Button>
      </div>
    </div>
  );
}

function Listing({
  events,
  f,
  setQuery,
  clear,
  filtersOpen,
  setFiltersOpen,
}: {
  events: BookableEvent[];
  f: ExploreFilters;
  setQuery: (p: Record<string, string>) => void;
  clear: () => void;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
}) {
  const active = [f.date, f.price, f.cat, f.q].filter(Boolean).length;
  const cat = CATEGORIES.find((c) => c.key === f.cat);
  const panel = <Filters f={f} setQuery={setQuery} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {cat ? cat.label : f.q ? `Results for “${f.q}”` : 'All events'}
            {f.city ? <span className="font-semibold text-slate-500"> in {f.city}</span> : null}
          </h1>
          <p className="text-sm text-slate-500" aria-live="polite">
            {events.length} event{events.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <span className="hidden sm:inline">Sort</span>
            <select
              value={f.sort}
              onChange={(e) => setQuery({ sort: e.target.value === 'soon' ? '' : e.target.value })}
              className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 font-medium text-slate-800"
            >
              <option value="soon">Date: soonest</option>
              <option value="price">Price: low to high</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 lg:hidden"
          >
            <SlidersHorizontal aria-hidden className="h-4 w-4" /> Filters{active ? ` (${active})` : ''}
          </button>
        </div>
      </div>

      {active > 0 && (
        <div className="flex flex-wrap gap-2">
          {f.q && <Chip label={`“${f.q}”`} onClear={() => setQuery({ q: '' })} />}
          {cat && <Chip label={cat.label} onClear={() => setQuery({ cat: '' })} />}
          {f.date && <Chip label={DATE_FILTERS.find((d) => d.key === f.date)?.label ?? f.date} onClear={() => setQuery({ date: '' })} />}
          {f.price && <Chip label={PRICE_FILTERS.find((p) => p.key === f.price)?.label ?? f.price} onClear={() => setQuery({ price: '' })} />}
          <button type="button" onClick={clear} className="min-h-[36px] px-2 text-sm font-semibold text-rose-600 hover:underline">
            Clear all
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[250px_1fr] lg:items-start">
        <aside className="sticky top-32 hidden rounded-2xl bg-white p-4 shadow-sm lg:block" aria-label="Filters">
          {panel}
        </aside>
        {events.length === 0 ? (
          <Empty title="No events match" icon={SearchX}>
            Try another date, price or category — or clear the filters.
            <div className="mt-3">
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            </div>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
            {events.map((e) => (
              <PosterCard key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>

      <Modal open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
        {panel}
        <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
          Show {events.length} event{events.length === 1 ? '' : 's'}
        </Button>
      </Modal>
    </div>
  );
}

function Filters({ f, setQuery }: { f: ExploreFilters; setQuery: (p: Record<string, string>) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <FilterGroup title="Date" options={DATE_FILTERS} value={f.date} onChange={(v) => setQuery({ date: v })} />
      <FilterGroup title="Category" options={CATEGORIES.map((c) => ({ key: c.key, label: `${c.emoji} ${c.label}` }))} value={f.cat} onChange={(v) => setQuery({ cat: v })} />
      <FilterGroup title="Price" options={PRICE_FILTERS} value={f.price} onChange={(v) => setQuery({ price: v })} />
    </div>
  );
}

function FilterGroup<K extends string>({ title, options, value, onChange }: { title: string; options: { key: K; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-slate-900">{title}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            aria-pressed={value === o.key}
            onClick={() => onChange(value === o.key ? '' : o.key)}
            className={cx(
              'min-h-[38px] rounded-lg border px-3 text-sm',
              value === o.key ? 'border-rose-500 bg-rose-500 font-semibold text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-rose-200 bg-rose-50 pl-3 pr-1 text-sm font-medium text-rose-700">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={onClear} className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-rose-100">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}

function PageSkeleton({ bare }: { bare?: boolean }) {
  const body = (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading events">
      <Skeleton className="h-[230px] w-full rounded-3xl sm:h-[300px]" />
      {[0, 1].map((r) => (
        <div key={r} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-[44%] shrink-0 sm:w-[30%] md:w-[23%] lg:w-[18.5%]">
                <Skeleton className="aspect-[3/4] w-full rounded-2xl" />
                <Skeleton className="mt-2 h-4 w-3/4" />
                <Skeleton className="mt-1 h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return bare ? body : <div className="mx-auto max-w-6xl px-4 py-5">{body}</div>;
}
