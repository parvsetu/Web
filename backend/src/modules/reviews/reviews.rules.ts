import { DateTime } from 'luxon';
import { ymd } from '../../common/time/validity';

/** Bump the version whenever the consent wording changes — each review stores the version it agreed to. */
export const REVIEW_CONSENT_VERSION = 'review-consent-2026-10-02';
export const REVIEW_CONSENT_TEXT =
  'I allow the mandal to show my review and photos publicly. The photos are mine, or were taken with the consent of the people in them.';

/** Reviews open on the festival's first day and close this many days after its last day. */
export const REVIEW_DAYS_AFTER_END = 30;
export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_BYTES = 2 * 1024 * 1024;
export const MAX_REVIEW_THUMB_BYTES = 300 * 1024;
export const MAX_REVIEW_TEXT = 500;
export const MAX_DISPLAY_NAME = 40;
/** Featured reviews show first on the landing page; at most this many per mandal. */
export const MAX_FEATURED_REVIEWS = 6;
/** Open public reports at which an approved review is hidden until someone checks it. */
export const REVIEW_REPORT_HIDE_THRESHOLD = 3;
export const REPORT_REASONS = ['SPAM', 'OFFENSIVE', 'FAKE', 'PRIVACY', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReviewWindowState = 'NOT_STARTED' | 'OPEN' | 'CLOSED';

/** The review window in the festival's own calendar (Asia/Kolkata for every festival today). */
export function reviewWindow(e: { startDate: Date; endDate: Date; timezone: string }, now = new Date()) {
  const today = DateTime.fromJSDate(now, { zone: e.timezone }).toISODate()!;
  const opensOn = ymd(e.startDate);
  const closesOn = DateTime.fromISO(ymd(e.endDate), { zone: 'utc' }).plus({ days: REVIEW_DAYS_AFTER_END }).toISODate()!;
  const state: ReviewWindowState = today < opensOn ? 'NOT_STARTED' : today > closesOn ? 'CLOSED' : 'OPEN';
  return { opensOn, closesOn, state };
}

/** "Rohit Kumar Sharma" → "Rohit S."; a single name stays as it is. */
export function defaultDisplayName(buyerName: string) {
  const parts = buyerName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Visitor';
  const first = parts[0].slice(0, 30);
  const last = parts.length > 1 ? parts[parts.length - 1] : '';
  return last ? `${first} ${[...last][0].toUpperCase()}.` : first;
}
