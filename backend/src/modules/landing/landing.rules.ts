import { BadRequestException } from '@nestjs/common';

/** Fixed theme palette for landing pages (keys; colours live in the frontend). */
export const LANDING_THEMES = ['saffron', 'crimson', 'marigold', 'peacock', 'emerald', 'royal', 'magenta', 'indigo'] as const;
export type LandingTheme = (typeof LANDING_THEMES)[number];

export const MAX_HIGHLIGHTS = 6;

const SOCIAL_HOSTS = {
  instagramUrl: { label: 'Instagram', hosts: ['instagram.com'] },
  facebookUrl: { label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  youtubeUrl: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
} as const;
export type SocialField = keyof typeof SOCIAL_HOSTS;

/** '' / undefined-safe: returns a normalised https URL on the platform's host, null to clear, or throws 400. */
export function socialUrl(field: SocialField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const { label, hosts } = SOCIAL_HOSTS[field];
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    throw new BadRequestException(`${label} link must be a full https:// address`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || !hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new BadRequestException(`${label} link must be an https:// link on ${hosts.join(' / ')}`);
  }
  return url.toString();
}

/** WhatsApp is a phone number: 10-digit Indian mobiles get +91; returns digits only (wa.me format). */
export function whatsappNumber(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const digits = v.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  if (!/^\d{10,15}$/.test(digits)) throw new BadRequestException('WhatsApp must be a phone number (10–15 digits, e.g. +91 98765 43210)');
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Paid-until after a purchase/grant: extends from the current expiry while it is still in the future. */
export function extendPaidUntil(current: Date | null, years: number, now = new Date()) {
  const base = current && current > now ? new Date(current) : new Date(now);
  base.setUTCFullYear(base.getUTCFullYear() + years);
  return base;
}

export function landingState(lp: { paidUntil: Date | null; enabled: boolean } | null, now = new Date()) {
  if (!lp?.paidUntil) return 'NOT_ACTIVE' as const;
  if (lp.paidUntil <= now) return 'EXPIRED' as const;
  return lp.enabled ? ('ACTIVE' as const) : ('DISABLED' as const);
}
