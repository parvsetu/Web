'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MapPin, RotateCcw, Search, SearchX, Sparkles } from 'lucide-react';
import { FestivalArt, Mandala, Toran } from '@/components/FestivalArt';
import { PublicShell } from '@/components/booking/PublicShell';
import { EventCard } from '@/components/booking/EventCard';
import { Alert, Button, Empty, Field, Input, Select, Skeleton } from '@/components/ui';
import { booking, bookingErrorMessage } from '@/lib/booking';
import type { BookableEvent, BookingLocation } from '@/lib/booking-types';

const SHOWCASE = ['GANESH_UTSAV', 'DURGA_PUJA', 'NAVRATRI', 'JANMASHTAMI', 'DIWALI'];

export default function BookPage() {
  return (
    <PublicShell wide>
      <Suspense fallback={<BrowseSkeleton />}>
        <Browse />
      </Suspense>
    </PublicShell>
  );
}

function Browse() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const state = params.get('state') ?? '';
  const city = params.get('city') ?? '';
  const q = params.get('q') ?? '';

  const [search, setSearch] = useState(q);
  const [locations, setLocations] = useState<BookingLocation[] | null>(null);
  const [events, setEvents] = useState<BookableEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  function setQuery(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }

  // Locations are a nice-to-have for the filters — the list still works without them.
  useEffect(() => {
    booking
      .locations()
      .then(setLocations)
      .catch(() => setLocations([]));
  }, []);

  // Debounce the search box into the URL.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      if (search.trim() !== q) setQuery({ q: search.trim() });
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    let alive = true;
    setEvents(null);
    setError(null);
    booking
      .events({ state: state || undefined, city: city || undefined, q: q || undefined })
      .then((r) => alive && setEvents(r))
      .catch((e) => {
        if (!alive) return;
        setError(bookingErrorMessage(e));
        setEvents([]);
      });
    return () => {
      alive = false;
    };
  }, [state, city, q, reload]);

  const cities = useMemo(() => locations?.find((l) => l.name === state)?.cities ?? [], [locations, state]);
  const filtered = !!(state || city || q);

  return (
    <div className="flex flex-col gap-5">
      {/* hero */}
      <section className="relative -mx-4 overflow-hidden px-5 pb-24 pt-9 text-white sm:mx-0 sm:rounded-3xl">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600" />
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-16 -top-10 h-64 w-64 text-white/15" />
        <Mandala className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 text-white/10" />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> No sign-up needed
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight drop-shadow-sm sm:text-4xl">Book festival passes</h1>
          <p className="mt-1 max-w-md text-base text-white/90">Pick a day and time slot, pay online, and get a QR pass on your phone in seconds.</p>
          <div className="mt-4 flex items-center gap-2">
            {SHOWCASE.map((t) => (
              <span key={t} className="h-11 w-11 rounded-full bg-white/95 p-1.5 shadow-md ring-2 ring-white/40">
                <FestivalArt type={t} className="h-full w-full" />
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* filters */}
      <section aria-label="Find a festival" className="relative z-10 -mt-20 rounded-3xl border border-orange-100 bg-white p-4 shadow-xl shadow-orange-900/10">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
          <Field label="State" htmlFor="f-state">
            <Select id="f-state" value={state} onChange={(e) => setQuery({ state: e.target.value, city: '' })} disabled={locations === null}>
              <option value="">All states</option>
              {(locations ?? []).map((l) => (
                <option key={l.code} value={l.name}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" htmlFor="f-city">
            <Select id="f-city" value={city} onChange={(e) => setQuery({ city: e.target.value })} disabled={!state}>
              <option value="">{state ? 'Any city' : 'Choose a state first'}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {city && !cities.includes(city) && <option value={city}>{city}</option>}
            </Select>
          </Field>
          <Field label="Search" htmlFor="f-q">
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input
                id="f-q"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Festival or mandal name"
                className="pl-10"
                enterKeyHint="search"
              />
            </div>
          </Field>
        </div>
        {filtered && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                router.replace(pathname, { scroll: false });
              }}
            >
              <RotateCcw aria-hidden className="h-4 w-4" /> Clear filters
            </Button>
          </div>
        )}
      </section>

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
        <CardsSkeleton />
      ) : events.length === 0 ? (
        !error && (
          <Empty title={filtered ? 'No festivals match your filters' : 'No festivals are taking bookings yet'} icon={filtered ? SearchX : MapPin}>
            {filtered ? 'Try another city, clear the search, or look across all states.' : 'Check back soon — mandals open bookings closer to the festival.'}
          </Empty>
        )
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-600" aria-live="polite">
            {events.length === 1 ? '1 festival' : `${events.length} festivals`} taking bookings
            {city ? ` in ${city}` : state ? ` in ${state}` : ''}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading festivals">
      {[0, 1, 2].map((i) => (
        <div key={i} className="overflow-hidden rounded-3xl border border-orange-100 bg-white">
          <Skeleton className="h-28 rounded-none" />
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-2 h-7 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrowseSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <Skeleton className="h-56 w-full rounded-3xl" />
      <CardsSkeleton />
    </div>
  );
}
