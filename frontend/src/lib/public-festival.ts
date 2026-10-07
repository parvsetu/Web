import type { SponsorPublic } from '@/components/SponsorStrip';
import type { Venue } from '@/components/VenueDetails';
import type { OrgBrand } from './media';
import type { PublicPhoto } from './gallery-types';

export interface PublicFestival {
  id: string;
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
