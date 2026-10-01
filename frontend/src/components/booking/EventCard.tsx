import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin, Tag } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { fmtDate, fmtMoney } from '@/lib/format';
import type { BookableEvent } from '@/lib/booking-types';
import { isFree } from '@/lib/booking';
import { FestivalArt, Mandala, Toran } from '../FestivalArt';

export function priceLabel(fromPrice: string | null): string | null {
  if (fromPrice === null) return null;
  return isFree(fromPrice) ? 'Free entry' : `From ${fmtMoney(fromPrice)}`;
}

export function placeLine(e: Pick<BookableEvent, 'location' | 'city' | 'state' | 'organization'>): string {
  const city = e.city || e.organization.city;
  return [e.location, city, e.state].filter(Boolean).join(', ');
}

export function EventCard({ event }: { event: BookableEvent }) {
  const t = festivalTheme(event.festivalType);
  const price = priceLabel(event.fromPrice);
  const place = placeLine(event);
  return (
    <Link
      href={`/book/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm shadow-orange-900/5 transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/40"
    >
      <div className="relative h-28 overflow-hidden" style={{ background: gradient(t) }}>
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 text-white/20" />
        <p className="absolute bottom-3 left-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/90">
          {t.label === 'Festival' ? event.festivalType.replace(/_/g, ' ') : t.label}
        </p>
        <span className="absolute bottom-[-22px] right-4 h-20 w-20 rounded-full bg-white p-2 shadow-md ring-4 ring-white/60">
          <FestivalArt type={event.festivalType} className="h-full w-full" />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-4 pb-4 pt-3">
        <h2 className="pr-20 text-lg font-extrabold leading-snug text-slate-900">{event.name}</h2>
        <p className="pr-20 text-sm font-medium" style={{ color: t.ink }}>
          {event.organization.name}
        </p>
        {place && (
          <p className="flex items-start gap-1.5 text-sm text-slate-600">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>{place}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-sm text-slate-600">
          <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
          {event.startDate === event.endDate ? fmtDate(event.startDate) : `${fmtDate(event.startDate)} – ${fmtDate(event.endDate)}`}
        </p>
        <div className="mt-auto flex items-center justify-between pt-3">
          {price ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: t.soft, color: t.ink }}
            >
              <Tag aria-hidden className="h-3.5 w-3.5" />
              {price}
            </span>
          ) : (
            <span className="text-sm text-slate-500">Passes coming soon</span>
          )}
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-700 group-hover:gap-2">
            Book <ChevronRight aria-hidden className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}
