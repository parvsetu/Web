'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, Instagram, MapPin, Mic2, Play, Sparkles, Sun, Ticket, Trees, Users, Warehouse, X } from 'lucide-react';
import { apiImageSrc } from '@/lib/media';
import { cx } from '@/lib/cx';
import { todayIn } from '@/lib/format';
import { dayPartsL, fmtDateL, fmtHHmmL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { CATEGORY_STYLE, type ProgrammeItem, type ProgrammeSetting, type PublicProgramme } from '@/lib/programme-types';
import { BookLink } from '@/app/[lang]/f/[eventId]/book-link';
import { useSalesState } from '@/lib/sales-window';

type Filter = 'ALL' | ProgrammeSetting;

/**
 * The festival's day-wise programme: a "star line-up" strip, one tab per day,
 * an Indoor / Outdoor filter, and a card per item (poster, artists, video).
 * The page around it is cached, so "today" is worked out in the browser.
 */
export function PublicProgramme({ eventId, programme, accent, canBook, salesOpensAt = null, salesClosesAt = null }: {
  eventId: string; programme: PublicProgramme; accent: string; canBook: boolean; salesOpensAt?: string | null; salesClosesAt?: string | null;
}) {
  const { t, locale } = useT();
  const { days, headliners } = programme;
  const [today, setToday] = useState('');
  const [active, setActive] = useState(days[0]?.date ?? '');
  const [filter, setFilter] = useState<Filter>('ALL');
  const sales = useSalesState(salesOpensAt, salesClosesAt);

  // Open on today's (or the next) programme day once we know the visitor's date.
  useEffect(() => {
    const now = todayIn(programme.timezone);
    setToday(now);
    const fromHash = window.location.hash.match(/^#day-(\d{4}-\d{2}-\d{2})$/)?.[1];
    const pick = days.find((d) => d.date === fromHash) ?? days.find((d) => d.date >= now) ?? days[0];
    if (pick) setActive(pick.date);
  }, [days, programme.timezone]);

  const day = days.find((d) => d.date === active) ?? days[0];
  const settings = useMemo(() => new Set(days.flatMap((d) => d.items.map((i) => i.setting)).filter(Boolean)), [days]);
  const showFilter = settings.size > 0;
  const items = (day?.items ?? []).filter((i) => filter === 'ALL' || i.setting === filter);

  function choose(date: string, itemId?: string) {
    setActive(date);
    setFilter('ALL');
    try {
      window.history.replaceState(null, '', `#day-${date}`);
    } catch {
      /* ignore */
    }
    if (itemId) requestAnimationFrame(() => document.getElementById(`prog-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  if (!day) return null;

  return (
    <section id="programme" className="flex flex-col gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarDays aria-hidden className="h-5 w-5" style={{ color: accent }} /> {t('prog.title')}
      </h2>

      {headliners.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
            <Sparkles aria-hidden className="h-4 w-4" style={{ color: accent }} /> {t('prog.starLineup')}
          </h3>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {headliners.map((h) => (
              <button
                key={`${h.itemId}-${h.name}`}
                type="button"
                onClick={() => choose(h.date, h.itemId)}
                className="flex w-32 shrink-0 snap-start flex-col items-center gap-1.5 text-center"
              >
                <Avatar src={h.photoUrl} name={h.name} className="h-24 w-24 text-2xl ring-2 ring-offset-2" ringColor={accent} />
                <span className="line-clamp-2 text-sm font-bold leading-tight">{h.name}</span>
                {h.role && <span className="line-clamp-1 text-xs text-slate-500">{h.role}</span>}
                <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${accent}14`, color: accent }}>
                  {dayPartsL(h.date, locale).day} {dayPartsL(h.date, locale).month} · {fmtHHmmL(h.startTime, locale)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {days.length > 1 && (
        <div role="tablist" aria-label={t('prog.title')} className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => {
            const p = dayPartsL(d.date, locale);
            const on = d.date === day.date;
            return (
              <button
                key={d.date}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => choose(d.date)}
                className={cx('flex min-w-[84px] shrink-0 snap-start flex-col items-center rounded-xl border-2 px-3 py-2 text-center transition', on ? 'text-white shadow-md' : 'border-slate-200 bg-white text-slate-700')}
                style={on ? { background: accent, borderColor: accent } : undefined}
              >
                <span className="text-[11px] font-bold uppercase opacity-80">{d.date === today ? t('prog.today') : t('prog.day', { n: d.dayNumber })}</span>
                <span className="text-lg font-extrabold leading-tight">{p.day} {p.month}</span>
                <span className="max-w-[110px] truncate text-[11px] opacity-90">{d.title || p.weekday}</span>
              </button>
            );
          })}
        </div>
      )}

      {(day.title || day.subtitle) && (
        <div className="rounded-xl px-3 py-2" style={{ background: `${accent}10` }}>
          {day.title && <p className="font-extrabold" style={{ color: accent }}>{day.title}</p>}
          {day.subtitle && <p className="text-sm text-slate-700">{day.subtitle}</p>}
          {days.length === 1 && <p className="text-xs text-slate-500">{fmtDateL(day.date, locale)}</p>}
        </div>
      )}

      {showFilter && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('prog.filter')}>
          {(['ALL', 'INDOOR', 'OUTDOOR'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cx('inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold', filter === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}
            >
              {f === 'INDOOR' && <Warehouse aria-hidden className="h-4 w-4" />}
              {f === 'OUTDOOR' && <Trees aria-hidden className="h-4 w-4" />}
              {f === 'ALL' ? t('prog.all') : f === 'INDOOR' ? t('prog.indoor') : t('prog.outdoor')}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-600">{t('prog.noneForFilter')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.id} id={`prog-${i.id}`}>
              <ItemCard item={i} accent={accent} bookEventId={canBook && sales === 'OPEN' && (!today || day.date >= today) ? eventId : null} />
            </li>
          ))}
        </ol>
      )}

      {canBook && sales === 'OPEN' && (!today || day.date >= today) && (
        <BookLink
          eventId={eventId}
          date={day.date}
          className="block rounded-xl font-bold text-white shadow"
        >
          <span className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-3 text-center" style={{ background: accent }}>
            <Ticket aria-hidden className="h-5 w-5" /> {t('prog.bookDay', { date: fmtDateL(day.date, locale) })}
          </span>
        </BookLink>
      )}
    </section>
  );
}

function ItemCard({ item: i, accent, bookEventId }: { item: ProgrammeItem; accent: string; /** Set when this item's ticket can be booked now. */ bookEventId: string | null }) {
  const { t, locale } = useT();
  const [more, setMore] = useState(false);
  const [playing, setPlaying] = useState(false);
  const cancelled = i.status === 'CANCELLED';
  const poster = apiImageSrc(i.posterUrl);
  const longText = (i.description?.length ?? 0) > 180;

  return (
    <article className={cx('overflow-hidden rounded-2xl border bg-white', i.isHeadline ? 'border-2 shadow-md' : 'border-slate-200', cancelled && 'opacity-75')} style={i.isHeadline ? { borderColor: accent } : undefined}>
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt={i.title} loading="lazy" className={cx('max-h-[420px] w-full bg-slate-100 object-cover', cancelled && 'grayscale')} />
      )}
      <div className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2 py-0.5 text-white">
            <Clock aria-hidden className="h-3.5 w-3.5" /> {fmtHHmmL(i.startTime, locale)}{i.endTime ? ` – ${fmtHHmmL(i.endTime, locale)}` : ''}
          </span>
          <span className={cx('rounded-full px-2 py-0.5', CATEGORY_STYLE[i.category] ?? CATEGORY_STYLE.OTHER)}>{t(`prog.cat.${i.category}` as 'prog.cat.OTHER')}</span>
          {i.setting && (
            <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5', i.setting === 'OUTDOOR' ? 'bg-lime-100 text-lime-900' : 'bg-violet-100 text-violet-900')}>
              {i.setting === 'OUTDOOR' ? <Sun aria-hidden className="h-3.5 w-3.5" /> : <Warehouse aria-hidden className="h-3.5 w-3.5" />}
              {i.setting === 'OUTDOOR' ? t('prog.outdoor') : t('prog.indoor')}
            </span>
          )}
          {i.isHeadline && !cancelled && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white" style={{ background: accent }}>
              <Sparkles aria-hidden className="h-3.5 w-3.5" /> {t('prog.headline')}
            </span>
          )}
          {cancelled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-white">
              <X aria-hidden className="h-3.5 w-3.5" /> {t('prog.cancelled')}
            </span>
          )}
        </div>

        <h3 className={cx('text-lg font-extrabold leading-snug', cancelled && 'line-through')}>{i.title}</h3>
        {cancelled && i.statusNote && <p className="rounded-lg bg-red-50 px-2 py-1 text-sm text-red-800">{i.statusNote}</p>}

        {(i.stage || i.language || i.ageLimit) && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {i.stage && (
              <div className="flex items-center gap-1">
                <dt><MapPin aria-label={t('prog.stage')} className="h-4 w-4" /></dt>
                <dd>{i.stage}</dd>
              </div>
            )}
            {i.language && (
              <div className="flex items-center gap-1">
                <dt><Mic2 aria-label={t('prog.language')} className="h-4 w-4" /></dt>
                <dd>{i.language}</dd>
              </div>
            )}
            {i.ageLimit && (
              <div className="flex items-center gap-1">
                <dt><Users aria-label={t('prog.age')} className="h-4 w-4" /></dt>
                <dd>{i.ageLimit}</dd>
              </div>
            )}
          </dl>
        )}

        {i.guests.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('prog.featuring')}</p>
            <ul className="flex flex-col gap-2">
              {i.guests.map((g) => (
                <li key={g.id} className="flex items-start gap-3">
                  <Avatar src={g.photoUrl} name={g.name} className="h-12 w-12 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-tight">
                      {g.name}
                      {g.role && <span className="font-normal text-slate-500"> · {g.role}</span>}
                    </p>
                    {g.bio && <p className="text-sm text-slate-600">{g.bio}</p>}
                    {g.instagramUrl && (
                      <a href={g.instagramUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-pink-700 underline-offset-2 hover:underline">
                        <Instagram aria-hidden className="h-4 w-4" /> {t('prog.instagram')}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {i.description && (
          <div>
            <p className={cx('whitespace-pre-line text-sm text-slate-700', !more && longText && 'line-clamp-3')}>{i.description}</p>
            {longText && (
              <button type="button" onClick={() => setMore((m) => !m)} className="mt-1 text-sm font-semibold underline-offset-2 hover:underline" style={{ color: accent }}>
                {more ? t('prog.less') : t('prog.more')}
              </button>
            )}
          </div>
        )}

        {i.video && (
          playing ? (
            <div className={cx('overflow-hidden rounded-xl bg-black', i.video.provider === 'INSTAGRAM' ? 'mx-auto aspect-[9/16] w-full max-w-[340px]' : 'aspect-video w-full')}>
              <iframe
                src={i.video.embedUrl}
                title={i.title}
                className="h-full w-full"
                loading="lazy"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 font-bold text-white"
                style={{ background: i.video.provider === 'INSTAGRAM' ? 'linear-gradient(90deg,#f58529,#dd2a7b,#8134af)' : '#dc2626' }}
              >
                <Play aria-hidden className="h-4 w-4 fill-current" /> {t('prog.watch')}
              </button>
              <a href={i.video.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-slate-600 underline underline-offset-2">
                {t('prog.openOn', { site: i.video.provider === 'INSTAGRAM' ? 'Instagram' : 'YouTube' })}
              </a>
            </div>
          )
        )}
        {i.ticket && !cancelled && bookEventId && (
          <BookLink eventId={bookEventId} date={i.date} item={i.id} className="mt-1 block rounded-xl font-bold text-white shadow-sm">
            <span className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-3" style={{ background: accent }}>
              <Ticket aria-hidden className="h-5 w-5" />
              {Number(i.ticket.price) > 0 ? t('prog.bookTicketPrice', { price: `₹${Number(i.ticket.price)}` }) : t('prog.bookTicketFree')}
            </span>
          </BookLink>
        )}
      </div>
    </article>
  );
}

function Avatar({ src, name, className, ringColor }: { src: string | null; name: string; className: string; ringColor?: string }) {
  const url = apiImageSrc(src);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
  const style = ringColor ? ({ '--tw-ring-color': ringColor } as React.CSSProperties) : undefined;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" loading="lazy" className={cx('shrink-0 rounded-full bg-slate-100 object-cover', className)} style={style} />
  ) : (
    <span aria-hidden className={cx('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-rose-200 font-extrabold text-rose-900', className)} style={style}>
      {initials || '★'}
    </span>
  );
}
