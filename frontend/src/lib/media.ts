// Server- and client-safe helpers for API-hosted images (logo, banner, public photos).

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

/** Absolute URL for an API-relative image path; null stays null. */
export function apiImageSrc(path: string | null | undefined): string | null {
  return path ? `${API}${path}` : null;
}

/** Fields every public payload adds to `organization` (null when the mandal hasn't uploaded one). */
export interface OrgBrand {
  logoUrl?: string | null;
  bannerUrl?: string | null;
  /** Set only while the mandal's paid landing page (/m/<slug>) is live. */
  landingSlug?: string | null;
}
