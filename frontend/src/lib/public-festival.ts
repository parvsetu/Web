import type { SponsorPublic } from '@/components/SponsorStrip';
import type { Venue } from '@/components/VenueDetails';
import type { OrgBrand } from './media';
import type { PublicPhoto } from './gallery-types';
import type { PublicProgramme } from './programme-types';
import type { PublicCompetition } from './competition-types';
import type { PublicArtwork } from './art-types';

export interface PublicFestival {
  id: string;
  /** Page address (/f/<slug>); null only for festivals not yet backfilled. */
  slug: string | null;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  venue?: Venue;
  state: string | null;
  city: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  status: 'ACTIVE' | 'COMPLETED';
  publicBookingEnabled: boolean;
  volunteerRegistrationOpen: boolean;
  bookingOpensAt: string | null;
  bookingClosesAt: string | null;
  salesState: 'NOT_YET' | 'OPEN' | 'CLOSED';
  organization: { name: string; city: string | null; state: string | null } & OrgBrand;
  timings: { label: string; startTime: string; endTime: string; price: string }[];
  fromPrice: string | null;
  sponsors: SponsorPublic[];
}

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

/** Server-side fetch of the public festival (cached for 5 minutes). */
export async function getPublicFestival(eventId: string): Promise<PublicFestival | null> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as PublicFestival) : null;
  } catch {
    return null;
  }
}

/** Public photos of a festival for the gallery strip (cached 5 minutes). */
export async function getPublicPhotos(eventId: string): Promise<PublicPhoto[]> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}/photos?pageSize=24`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as { items: PublicPhoto[] }).items : [];
  } catch {
    return [];
  }
}

/** Day-wise programme / line-up (cached 5 minutes); null when there's none to show. */
export async function getPublicProgramme(eventId: string): Promise<PublicProgramme | null> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}/programme`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const p = (await res.json()) as PublicProgramme;
    return p.days.length ? p : null;
  } catch {
    return null;
  }
}

/** Published competitions of a festival (cached 1 minute — spots move). */
export async function getPublicCompetitions(eventId: string): Promise<PublicCompetition[]> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}/competitions`, { next: { revalidate: 60 } });
    return res.ok ? ((await res.json()) as PublicCompetition[]) : [];
  } catch {
    return [];
  }
}

/** Published artworks of a festival's art gallery (cached 5 minutes). */
export async function getPublicArtworks(eventId: string): Promise<PublicArtwork[]> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}/artworks`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as PublicArtwork[]) : [];
  } catch {
    return [];
  }
}

/** Stall booking for vendors: open or not, and what's left (cached 1 minute — counts move). */
export async function getPublicStalls(eventId: string): Promise<{ open: boolean; types: { available: number; price: string }[] }> {
  try {
    const res = await fetch(`${API}/public/events/${encodeURIComponent(eventId)}/stalls`, { next: { revalidate: 60 } });
    return res.ok ? await res.json() : { open: false, types: [] };
  } catch {
    return { open: false, types: [] };
  }
}

/** Absolute site origin for links/previews. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

export function fmtRange(start: string, end: string) {
  const f = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return start === end ? f(start) : `${f(start)} – ${f(end)}`;
}
