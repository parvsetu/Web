'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Ticket } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { fmtDateL } from '@/lib/i18n/format';
import { useT, type I18n } from '@/lib/i18n/provider';
import { isFree } from '@/lib/booking';
import { eventCity, isLive } from '@/lib/explore';
import type { BookableEvent } from '@/lib/booking-types';
import { cx } from '@/lib/cx';
import { apiImageSrc } from '@/lib/media';
import { FestivalArt, Mandala, Toran } from '../FestivalArt';

const dates = (e: BookableEvent, locale: string) =>
  e.startDate === e.endDate ? fmtDateL(e.startDate, locale) : `${fmtDateL(e.startDate, locale)} – ${fmtDateL(e.endDate, locale)}`;
const priceText = (i: I18n, p: string | null) => (p === null ? i.t('card.passesSoon') : isFree(p) ? i.t('card.freeEntry') : i.t('card.onwards', { price: fmtMoney(p) }));

/** Mandal name, linking to its landing page (/m/<slug>) while that page is live. */
export function MandalName({ org, className }: { org: BookableEvent['organization']; className?: string }) {
  const logo = apiImageSrc(org.logoUrl);
  const inner = (
    <>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-4 w-4 shrink-0 rounded-full bg-white object-contain" />
      )}
      <span className="truncate">{org.name}</span>
    </>
  );
  return org.landingSlug ? (
    <Link href={`/m/${org.landingSlug}`} className={cx('inline-flex min-w-0 items-center gap-1 hover:underline', className)}>{inner}</Link>
  ) : (
    <span className={cx('inline-flex min-w-0 items-center gap-1', className)}>{inner}</span>
  );
}

/** Portrait "poster" card: the mandal's banner (or themed festival artwork) on top, details below. */
export function PosterCard({ event, className }: { event: BookableEvent; className?: string }) {
  const t = festivalTheme(event.festivalType);
  const live = isLive(event);
  const banner = apiImageSrc(event.organization.bannerUrl);
  const i18n = useT();
  return (
    <div className={cx('group flex flex-col gap-2 rounded-2xl', className)}>
      <Link
        href={`/book/${event.id}`}
        className="relative block aspect-[3/4] overflow-hidden rounded-2xl shadow-md shadow-orange-900/10 transition group-hover:-translate-y-1 group-hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40"
        style={{ background: gradient(t, 160) }}
        aria-label={event.name}
      >
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <Toran className="absolute inset-x-0 top-0 w-full" />
            <Mandala className="pointer-events-none absolute -right-10 top-8 h-40 w-40 text-white/15" />
            <Mandala className="pointer-events-none absolute -bottom-14 -left-12 h-40 w-40 text-white/10" />
            <span className="absolute left-1/2 top-[38%] h-[46%] w-[66%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 p-[9%] shadow-lg ring-4 ring-white/40">
              <FestivalArt type={event.festivalType} className="h-full w-full" />
            </span>
          </>
        )}
        {live && (
          <span className="absolute left-2 top-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {i18n.t('card.live')}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2.5 pt-8 text-white">
          <p className="flex items-center gap-1 text-xs font-semibold">
            <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" /> {dates(event, i18n.locale)}
          </p>
        </div>
      </Link>
      <div className="px-0.5">
        <Link href={`/book/${event.id}`} className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 hover:underline">{event.name}</Link>
        <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-slate-500">
          <span className="max-w-[55%] shrink-0 truncate">{i18n.festivalType(event.festivalType)} ·</span>
          <MandalName org={event.organization} />
        </p>
        {eventCity(event) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <MapPin aria-hidden className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1">{[event.location, eventCity(event)].filter(Boolean).join(', ')}</span>
          </p>
        )}
        <p className="mt-1 text-sm font-bold" style={{ color: t.ink }}>
          {priceText(i18n, event.fromPrice)}
        </p>
      </div>
    </div>
  );
}

/** Horizontal, swipeable row of posters with arrow buttons on desktop. */
export function EventRow({ title, subtitle, events, seeAll }: { title: string; subtitle?: string; events: BookableEvent[]; seeAll?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useT();
  // "See all" and the arrows only appear when the row really overflows at the
  // current width. Hidden until measured, so server and first client render match.
  const [over, setOver] = useState({ overflow: false, atStart: true, atEnd: true });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth > el.clientWidth + 1;
    const next = { overflow, atStart: el.scrollLeft <= 1, atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 };
    setOver((o) => (o.overflow === next.overflow && o.atStart === next.atStart && o.atEnd === next.atEnd ? o : next));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, events.length]);

  if (!events.length) return null;
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  const arrow = 'hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white md:flex';
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        {over.overflow && (
          <div className="flex shrink-0 items-center gap-1">
            {seeAll && (
              <button type="button" onClick={seeAll} className="inline-flex min-h-[44px] items-center gap-0.5 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
                {t('card.seeAll')} <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            )}
            <button type="button" aria-label={t('card.scrollLeft', { title })} disabled={over.atStart} onClick={() => scroll(-1)} className={arrow}>
              <ChevronLeft aria-hidden className="h-5 w-5" />
            </button>
            <button type="button" aria-label={t('card.scrollRight', { title })} disabled={over.atEnd} onClick={() => scroll(1)} className={arrow}>
              <ChevronRight aria-hidden className="h-5 w-5" />
            </button>
          </div>
        )}
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
  const i18n = useT();
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
      aria-label={i18n.t('card.featured')}
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
          const banner = apiImageSrc(e.organization.bannerUrl);
          const logo = apiImageSrc(e.organization.logoUrl);
          return (
            <div key={e.id} role="group" aria-roledescription="slide" aria-label={i18n.t('card.slideOf', { i: i + 1, n: events.length })} className="relative w-full shrink-0 snap-start">
              <div className="relative flex min-h-[230px] items-center overflow-hidden px-5 py-7 text-white sm:min-h-[300px] sm:px-10 md:px-20" style={{ background: gradient(t, 110) }}>
                {banner && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/10" />
                  </>
                )}
                <Toran className="absolute inset-x-0 top-0 w-full" />
                <Mandala className="pointer-events-none absolute -right-20 -top-16 h-80 w-80 text-white/15" />
                <Mandala className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 text-white/10" />
                <div className="relative z-10 max-w-[62%] sm:max-w-[55%]">
                  {isLive(e) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide shadow">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {i18n.t('explore.happeningNow')}
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">{i18n.festivalType(e.festivalType)}</span>
                  )}
                  <h2 className="mt-2 line-clamp-2 text-2xl font-extrabold leading-tight drop-shadow sm:text-4xl">{e.name}</h2>
                  <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-white/90 sm:text-base">
                    <MandalName org={e.organization} />
                    {eventCity(e) ? <span className="shrink-0">· {eventCity(e)}</span> : null}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarDays aria-hidden className="h-4 w-4 shrink-0" /> {dates(e, i18n.locale)}
                  </p>
                  <Link
                    href={`/book/${e.id}`}
                    className="mt-4 inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-white px-4 py-1.5 text-sm font-bold leading-tight shadow-lg hover:bg-orange-50 sm:px-5 sm:text-base"
                    style={{ color: t.ink }}
                  >
                    <Ticket aria-hidden className="h-5 w-5 shrink-0" /> {i18n.t('card.book', { price: priceText(i18n, e.fromPrice) })}
                  </Link>
                </div>
                <span className="absolute right-4 top-1/2 h-36 w-36 -translate-y-1/2 rounded-full bg-white/95 p-4 shadow-2xl ring-8 ring-white/30 sm:right-12 sm:h-56 sm:w-56 md:right-20 sm:p-6">
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt={i18n.t('common.logo', { name: e.organization.name })} className="h-full w-full rounded-full object-contain" />
                  ) : (
                    <FestivalArt type={e.festivalType} className="h-full w-full" />
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {events.length > 1 && (
        <>
          <button type="button" aria-label={i18n.t('common.previous')} onClick={() => go(index - 1)} className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white md:flex">
            <ChevronLeft aria-hidden className="h-6 w-6" />
          </button>
          <button type="button" aria-label={i18n.t('common.next')} onClick={() => go(index + 1)} className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white md:flex">
            <ChevronRight aria-hidden className="h-6 w-6" />
          </button>
          <div className="mt-3 flex justify-center gap-1.5">
            {events.map((e, i) => (
              <button
                key={e.id}
                type="button"
                aria-label={i18n.t('card.showSlide', { i: i + 1 })}
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
