import type { SponsorPublic } from '@/components/SponsorStrip';

export interface PublicFestival {
  id: string;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  state: string | null;
  city: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  status: 'ACTIVE' | 'COMPLETED';
  publicBookingEnabled: boolean;
  volunteerRegistrationOpen: boolean;
  organization: { name: string; city: string | null; state: string | null };
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
