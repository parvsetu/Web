import type { PublicFestival } from './public-festival';
import type { PublicProgramme } from './programme-types';
import { apiImageSrc } from './media';
import { LANGUAGES } from './i18n/config';

/** The page address of a festival: its slug when it has one. */
export const festivalPath = (f: { id: string; slug?: string | null }) => `/f/${f.slug ?? f.id}`;

/** hreflang alternates: the same URL with ?lang=xx (the middleware serves that language). */
export function languageAlternates(path: string): Record<string, string> {
  const out: Record<string, string> = { 'x-default': path };
  for (const l of LANGUAGES) out[`${l.code}-IN`] = l.code === 'en' ? path : `${path}?lang=${l.code}`;
  return out;
}

/** schema.org Event for Google's event results: dates, place, organiser, tickets, artists. */
export function festivalJsonLd(f: PublicFestival, programme: PublicProgramme | null, url: string, imageUrl: string) {
  const v = f.venue;
  const prices = f.timings.map((t) => Number(t.price));
  const performers = [...new Map((programme?.headliners ?? []).map((h) => [h.name, h])).values()].slice(0, 20);
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: f.name,
    description: f.description ?? `${f.name} — ${f.organization.name}`,
    url,
    image: [imageUrl, ...(f.organization.bannerUrl ? [apiImageSrc(f.organization.bannerUrl)!] : [])],
    startDate: f.startDate,
    endDate: f.endDate,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: v?.name ?? f.location ?? f.organization.name,
      address: {
        '@type': 'PostalAddress',
        streetAddress: v?.address ?? f.location ?? undefined,
        addressLocality: v?.city ?? f.city ?? undefined,
        addressRegion: v?.state ?? f.state ?? undefined,
        postalCode: v?.pincode ?? undefined,
        addressCountry: 'IN',
      },
      ...(v?.lat != null && v?.lng != null ? { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } } : {}),
    },
    organizer: {
      '@type': 'Organization',
      name: f.organization.name,
      ...(f.organization.landingSlug ? { url: url.replace(/\/f\/.*$/, `/m/${f.organization.landingSlug}`) } : {}),
    },
    ...(f.publicBookingEnabled && prices.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            url: url.replace(/\/f\/.*$/, `/book/${f.id}`),
            priceCurrency: 'INR',
            lowPrice: Math.min(...prices),
            highPrice: Math.max(...prices),
            availability: f.status === 'ACTIVE' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
          },
        }
      : { isAccessibleForFree: prices.every((p) => p === 0) }),
    ...(performers.length
      ? { performer: performers.map((h) => ({ '@type': h.role && /group|band|troupe|dal|academy|ensemble/i.test(`${h.role} ${h.name}`) ? 'PerformingGroup' : 'Person', name: h.name })) }
      : {}),
  };
}

/** Safe to put inside <script type="application/ld+json">. */
export const jsonLdString = (data: unknown) => JSON.stringify(data).replace(/</g, '\\u003c');
