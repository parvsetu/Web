/**
 * Public branding of a mandal on any payload (festival page, booking, explore,
 * pass, receipt). Only timestamps are selected — image bytes are never loaded
 * in list queries; the URLs are cache-busted by the update time.
 */
export const ORG_BRAND_SELECT = {
  id: true, slug: true, logoUpdatedAt: true, bannerUpdatedAt: true,
  landingPage: { select: { paidUntil: true, enabled: true } },
} as const;

export function orgImageUrls(o: { id: string; logoUpdatedAt: Date | null; bannerUpdatedAt: Date | null }) {
  return {
    logoUrl: o.logoUpdatedAt ? `/public/organizations/${o.id}/logo?v=${o.logoUpdatedAt.getTime()}` : null,
    bannerUrl: o.bannerUpdatedAt ? `/public/organizations/${o.id}/banner?v=${o.bannerUpdatedAt.getTime()}` : null,
  };
}

/** A landing page is live while it is paid up AND the mandal hasn't switched it off. */
export function landingActive(lp: { paidUntil: Date | null; enabled: boolean } | null | undefined, now = new Date()) {
  return !!lp && lp.enabled && !!lp.paidUntil && lp.paidUntil > now;
}

/**
 * Replaces the selected brand fields with logoUrl/bannerUrl and
 * `landingSlug` (set only while the mandal's /m/<slug> page is live).
 */
export function presentOrgBrand<T extends {
  id: string; logoUpdatedAt: Date | null; bannerUpdatedAt: Date | null;
  slug?: string; landingPage?: { paidUntil: Date | null; enabled: boolean } | null;
}>(o: T) {
  const { logoUpdatedAt: _l, bannerUpdatedAt: _b, landingPage, slug: _s, ...rest } = o;
  return {
    ...rest,
    ...orgImageUrls(o),
    ...(o.slug !== undefined ? { landingSlug: landingActive(landingPage) ? o.slug : null } : {}),
  };
}
