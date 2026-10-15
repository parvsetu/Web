import { createHmac } from 'crypto';
import { DateTime } from 'luxon';

/**
 * 80G / Form 10BD / Form 10BE rules — pure functions, no I/O. Every figure
 * with legal weight (cash limit, due date) comes from PlatformSettings, not
 * from here. All of this needs CA review before real filings.
 */

const TZ = 'Asia/Kolkata';

/** Donor ID types accepted by Form 10BD, with the portal's ID code. */
export const DONOR_ID_TYPES = {
  PAN: { code: 1, label: 'PAN', pattern: /^[A-Z]{5}\d{4}[A-Z]$/ },
  AADHAAR: { code: 2, label: 'Aadhaar', pattern: /^\d{12}$/ },
  TIN: { code: 3, label: 'Tax Identification Number (foreign donor)', pattern: /^[A-Z0-9-]{5,30}$/ },
  PASSPORT: { code: 4, label: 'Passport', pattern: /^[A-Z0-9]{6,12}$/ },
  VOTER_ID: { code: 5, label: 'Elector’s photo identity card', pattern: /^[A-Z0-9/]{6,20}$/ },
  DRIVING_LICENSE: { code: 6, label: 'Driving licence', pattern: /^[A-Z0-9-]{8,20}$/ },
  RATION_CARD: { code: 7, label: 'Ration card', pattern: /^[A-Z0-9/-]{6,20}$/ },
} as const;
export type DonorIdType = keyof typeof DONOR_ID_TYPES;
export const DONOR_ID_TYPE_KEYS = Object.keys(DONOR_ID_TYPES) as DonorIdType[];

export const PAN_RE = DONOR_ID_TYPES.PAN.pattern;

/** Upper-case, no spaces; null if it doesn't match the type's format. */
export function normalizeDonorId(type: DonorIdType, raw: string) {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  return DONOR_ID_TYPES[type].pattern.test(v) ? v : null;
}

/** Keyed hash that groups one donor's donations (same ID type + number) without storing the number in clear. */
export function donorIdHash(type: DonorIdType, normalized: string) {
  const key = process.env.DATA_ENCRYPTION_KEY ?? `parvsetu-donor:${process.env.JWT_SECRET ?? 'dev'}`;
  return createHmac('sha256', key).update(`${type}:${normalized}`).digest('hex');
}

/** Indian financial year of a moment (IST): 1 Apr 2026 … 31 Mar 2027 → "2026-27". */
export function financialYearOf(d: Date) {
  const t = DateTime.fromJSDate(d, { zone: TZ });
  const start = t.month >= 4 ? t.year : t.year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** UTC bounds and the 10BD / 10BE due date of "2026-27". */
export function financialYearRange(fy: string, dueMonthDay = '05-31') {
  const start = Number(fy.slice(0, 4));
  const from = DateTime.fromObject({ year: start, month: 4, day: 1 }, { zone: TZ });
  const to = from.plus({ years: 1 });
  const [mm, dd] = dueMonthDay.split('-').map(Number);
  return { gte: from.toUTC().toJSDate(), lt: to.toUTC().toJSDate(), dueDate: DateTime.fromObject({ year: start + 1, month: mm, day: dd }).toISODate()! };
}

export const FY_RE = /^\d{4}-\d{2}$/;
export const isValidFy = (fy: string) => FY_RE.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5));

export type IneligibleReason =
  | 'NOT_PAID' | 'ANONYMOUS' | 'NO_VERIFIED_80G' | 'OUTSIDE_80G_VALIDITY' | 'CASH_OVER_LIMIT' | 'DONOR_ID_MISSING';

export const INELIGIBLE_LABEL: Record<IneligibleReason, string> = {
  NOT_PAID: 'Payment not confirmed (or refunded)',
  ANONYMOUS: 'Anonymous donation — no 80G deduction',
  NO_VERIFIED_80G: 'The mandal has no verified 80G registration',
  OUTSIDE_80G_VALIDITY: 'Donated outside the 80G registration’s validity',
  CASH_OVER_LIMIT: 'Cash donation above the 80G cash limit',
  DONOR_ID_MISSING: 'Donor PAN / ID not recorded',
};

export interface EligibilityInput {
  paymentStatus: string;
  isAnonymous: boolean;
  method: string;
  amountPaise: number;
  donatedAt: Date;
  hasDonorId: boolean;
  profile: { status: string; validFrom: Date; validTo: Date | null; deductionPercent: number | null } | null;
  cashLimitPaise: number;
}

/**
 * The single eligibility decision. Order matters only for which reason is
 * shown; any failing rule makes the donation ineligible. Dates compare as IST
 * calendar days against the registration's DATE columns.
 */
export function evaluate80G(x: EligibilityInput): { eligible: true; deductionPercent: number } | { eligible: false; reason: IneligibleReason } {
  if (x.paymentStatus !== 'SUCCESS') return { eligible: false, reason: 'NOT_PAID' };
  if (x.isAnonymous) return { eligible: false, reason: 'ANONYMOUS' };
  if (!x.profile || x.profile.status !== 'VERIFIED' || !x.profile.deductionPercent) return { eligible: false, reason: 'NO_VERIFIED_80G' };
  const day = DateTime.fromJSDate(x.donatedAt, { zone: TZ }).toISODate()!;
  const from = x.profile.validFrom.toISOString().slice(0, 10);
  const to = x.profile.validTo?.toISOString().slice(0, 10);
  if (day < from || (to && day > to)) return { eligible: false, reason: 'OUTSIDE_80G_VALIDITY' };
  if (x.method === 'CASH' && x.amountPaise > x.cashLimitPaise) return { eligible: false, reason: 'CASH_OVER_LIMIT' };
  if (!x.hasDonorId) return { eligible: false, reason: 'DONOR_ID_MISSING' };
  return { eligible: true, deductionPercent: x.profile.deductionPercent };
}

/** Form 10BD "mode of receipt". */
export function receiptMode(method: string) {
  if (method === 'CASH') return 'Cash';
  if (method === 'OTHER') return 'Others';
  return 'Electronic modes including account payee cheque/draft';
}

/**
 * s.115BBC: anonymous donations above the higher of 5% of total donations or
 * ₹1,00,000 are taxable for many trusts (religious-only trusts are partly
 * exempt). Shown as information for the mandal's CA — never applied anywhere.
 */
export function anonymousDonationCheck(totalPaise: number, anonymousPaise: number) {
  const thresholdPaise = Math.max(Math.round(totalPaise * 0.05), 1_00_000_00);
  return { thresholdPaise, abovePaise: Math.max(0, anonymousPaise - thresholdPaise) };
}

export const maskId = (type: string | null, last4: string | null) => (type && last4 ? `${DONOR_ID_TYPES[type as DonorIdType]?.label ?? type} ••••${last4}` : null);
