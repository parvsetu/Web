'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Ticket } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { fmtDate, fmtMoney } from '@/lib/format';
import { isFree } from '@/lib/booking';
import { eventCity, isLive } from '@/lib/explore';
import type { BookableEvent } from '@/lib/booking-types';
import { cx } from '@/lib/cx';
import { FestivalArt, Mandala, Toran } from '../FestivalArt';

const dates = (e: BookableEvent) => (e.startDate === e.endDate ? fmtDate(e.startDate) : `${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`);
const priceText = (p: string | null) => (p === null ? 'Passes soon' : isFree(p) ? 'Free entry' : `${fmtMoney(p)} onwards`);
const typeLabel = (type: string) => {
  const t = festivalTheme(type);
  return t.label === 'Festival' ? type.replace(/_/g, ' ').toLowerCase() : t.label;
};

/** Portrait "poster" card: themed artwork on top, details below. */
export function PosterCard({ event, className }: { event: BookableEvent; className?: string }) {
  const t = festivalTheme(event.festivalType);
  const live = isLive(event);
  return (
    <Link
      href={`/book/${event.id}`}
      className={cx('group flex flex-col gap-2 rounded-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40', className)}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl shadow-md shadow-orange-900/10 transition group-hover:-translate-y-1 group-hover:shadow-xl" style={{ background: gradient(t, 160) }}>
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-10 top-8 h-40 w-40 text-white/15" />
        <Mandala className="pointer-events-none absolute -bottom-14 -left-12 h-40 w-40 text-white/10" />
        <span className="absolute left-1/2 top-[38%] h-[46%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 p-[9%] shadow-lg ring-4 ring-white/40">
          <FestivalArt type={event.festivalType} className="h-full w-full" />
        </span>
        {live && (
          <span className="absolute left-2 top-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2.5 pt-8 text-white">
          <p className="flex items-center gap-1 text-xs font-semibold">
            <CalendarDays aria-hidden className="h-3.5 w-3.5" /> {dates(event)}
          </p>
        </div>
      </div>
      <div className="px-0.5">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900">{event.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-xs capitalize text-slate-500">{typeLabel(event.festivalType)} · {event.organization.name}</p>
        {eventCity(event) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <MapPin aria-hidden className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{[event.location, eventCity(event)].filter(Boolean).join(', ')}</span>
          </p>
        )}
        <p className="mt-1 text-sm font-bold" style={{ color: t.ink }}>
          {priceText(event.fromPrice)}
        </p>
      </div>
    </Link>
  );
}

/** Horizontal, swipeable row of posters with arrow buttons on desktop. */
export function EventRow({ title, subtitle, events, seeAll }: { title: string; subtitle?: string; events: BookableEvent[]; seeAll?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!events.length) return null;
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1">
          {seeAll && (
            <button type="button" onClick={seeAll} className="inline-flex min-h-[44px] items-center gap-0.5 rounded-xl px-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              See all <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          )}
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)} className="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 md:flex">
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)} className="hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 md:flex">
            <ChevronRight aria-hidden className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div ref={ref} className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {events.map((e) => (
          <PosterCard key={e.id} event={e} className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[18.5%]" />
        ))}
      </div>
    </section>
  );
}

/** Auto-advancing featured banner. Swipe on phones, arrows/dots on desktop; pauses on hover/focus. */
export function HeroCarousel({ events }: { events: BookableEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const go = useCallback((i: number) => {
    const el = ref.current;
    if (!el || !events.length) return;
    const n = (i + events.length) % events.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
  }, [events.length]);

  useEffect(() => {
    if (paused || events.length < 2) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const id = setInterval(() => go(index + 1), 5000);
    return () => clearInterval(id);
  }, [index, paused, go, events.length]);

  if (!events.length) return null;
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured events"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div
        ref={ref}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {events.map((e, i) => {
          const t = festivalTheme(e.festivalType);
          return (
            <div key={e.id} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${events.length}`} className="relative w-full shrink-0 snap-start">
              <div className="relative flex min-h-[230px] items-center overflow-hidden px-5 py-7 text-white sm:min-h-[300px] sm:px-10 md:px-20" style={{ background: gradient(t, 110) }}>
                <Toran className="absolute inset-x-0 top-0 w-full" />
                <Mandala className="pointer-events-none absolute -right-20 -top-16 h-80 w-80 text-white/15" />
                <Mandala className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 text-white/10" />
                <div className="relative z-10 max-w-[62%] sm:max-w-[55%]">
                  {isLive(e) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide shadow">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Happening now
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">{typeLabel(e.festivalType)}</span>
                  )}
                  <h2 className="mt-2 line-clamp-2 text-2xl font-extrabold leading-tight drop-shadow sm:text-4xl">{e.name}</h2>
                  <p className="mt-1 line-clamp-1 text-sm text-white/90 sm:text-base">{e.organization.name}{eventCity(e) ? ` · ${eventCity(e)}` : ''}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarDays aria-hidden className="h-4 w-4" /> {dates(e)}
                  </p>
                  <Link
                    href={`/book/${e.id}`}
                    className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-white px-5 font-bold shadow-lg hover:bg-orange-50"
                    style={{ color: t.ink }}
                  >
                    <Ticket aria-hidden className="h-5 w-5" /> Book · {priceText(e.fromPrice)}
                  </Link>
                </div>
                <span className="absolute right-4 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-white/95 p-4 shadow-2xl ring-8 ring-white/30 sm:right-12 sm:h-56 sm:w-56 md:right-20 sm:p-6">
                  <FestivalArt type={e.festivalType} className="h-full w-full" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {events.length > 1 && (
        <>
          <button type="button" aria-label="Previous" onClick={() => go(index - 1)} className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white md:flex">
            <ChevronLeft aria-hidden className="h-6 w-6" />
          </button>
          <button type="button" aria-label="Next" onClick={() => go(index + 1)} className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white md:flex">
            <ChevronRight aria-hidden className="h-6 w-6" />
          </button>
          <div className="mt-3 flex justify-center gap-1.5">
            {events.map((e, i) => (
              <button
                key={e.id}
                type="button"
                aria-label={`Show slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cx('h-2 rounded-full transition-all', i === index ? 'w-6 bg-rose-500' : 'w-2 bg-slate-300 hover:bg-slate-400')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
