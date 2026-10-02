'use client';

import { Info, Landmark, MapPin, Navigation, Phone } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/provider';

/** Matches the backend `presentVenue()` block. */
export interface Venue {
  name: string | null;
  address: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  fullAddress: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  contactPhone: string | null;
  mapUrl: string | null;
  embedUrl: string | null;
}

export const hasVenue = (v: Venue | null | undefined): v is Venue => !!v && !!(v.fullAddress || v.mapUrl);

/** Compact block for the pass itself (prints too). */
export function VenueLines({ venue, className }: { venue: Venue; className?: string }) {
  const { t } = useT();
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      {venue.name && <span className="font-semibold">{venue.name}</span>}
      {venue.address && <span>{venue.address}</span>}
      {venue.landmark && <span className="text-slate-600">{t('venue.near', { landmark: venue.landmark })}</span>}
      {(venue.city || venue.pincode) && <span className="text-slate-600">{[venue.city, venue.state, venue.pincode].filter(Boolean).join(', ')}</span>}
      {venue.notes && <span className="text-xs text-slate-500">{venue.notes}</span>}
      {venue.contactPhone && <span className="text-xs text-slate-500">{t('venue.help', { phone: venue.contactPhone })}</span>}
      {venue.mapUrl && (
        <a href={venue.mapUrl} target="_blank" rel="noopener noreferrer" className="no-print mt-1 inline-flex w-fit items-center gap-1 text-sm font-semibold text-orange-700 hover:underline">
          <Navigation aria-hidden className="h-4 w-4" /> {t('venue.directions')}
        </a>
      )}
    </div>
  );
}

/** Full card with an embedded map, for the pass page, booking and the public festival page. */
export function VenueCard({ venue, accent = '#c2410c', className, map = true }: { venue: Venue | null | undefined; accent?: string; className?: string; map?: boolean }) {
  const { t } = useT();
  if (!hasVenue(venue)) return null;
  return (
    <section className={cx('overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm', className)} aria-label={t('venue.aria')}>
      {map && venue.embedUrl && (
        <iframe
          title={t('venue.mapOf', { name: venue.name ?? t('venue.theVenue') })}
          src={venue.embedUrl}
          className="no-print block h-56 w-full border-0 sm:h-72"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}
      <div className="flex flex-col gap-3 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <MapPin aria-hidden className="h-5 w-5" style={{ color: accent }} /> {venue.name || t('venue.venue')}
        </h2>
        <dl className="grid gap-2 text-sm text-slate-700">
          {venue.fullAddress && <Row icon={MapPin}>{[venue.address, venue.city, venue.state, venue.pincode].filter(Boolean).join(', ') || venue.fullAddress}</Row>}
          {venue.landmark && <Row icon={Landmark}>{t('venue.near', { landmark: venue.landmark })}</Row>}
          {venue.notes && <Row icon={Info}><span className="whitespace-pre-line">{venue.notes}</span></Row>}
          {venue.contactPhone && (
            <Row icon={Phone}>
              <a href={`tel:${venue.contactPhone.replace(/[\s-]/g, '')}`} className="font-semibold text-orange-700 hover:underline">{venue.contactPhone}</a>
            </Row>
          )}
        </dl>
        {venue.mapUrl && (
          <a
            href={venue.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-print inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 font-semibold text-white shadow-md"
          >
            <Navigation aria-hidden className="h-5 w-5" /> {t('venue.directions')}
          </a>
        )}
      </div>
    </section>
  );
}

function Row({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}
