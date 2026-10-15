/** Blogger referral commission: PERCENT = bps of the booking's ex-GST ticket value, FIXED = paise per paid booking. */
export type CommissionMode = 'PERCENT' | 'FIXED';
export const COMMISSION_MODES = ['PERCENT', 'FIXED'] as const;

/** Commission on one paid booking. A fixed amount never exceeds the booking's own ticket value. */
export function commissionFor(mode: CommissionMode, value: number, basePaise: number) {
  if (basePaise <= 0 || value <= 0) return 0;
  return mode === 'PERCENT' ? Math.round((basePaise * value) / 10000) : Math.min(value, basePaise);
}

export function presentCommission(mode: string, value: number, custom = false) {
  const m = mode as CommissionMode;
  return {
    mode: m,
    percent: m === 'PERCENT' ? (value / 100).toFixed(2) : null,
    amount: m === 'FIXED' ? (value / 100).toFixed(2) : null,
    label: m === 'PERCENT' ? `${value / 100}% of the ticket value` : `₹${(value / 100).toFixed(2)} per booking`,
    custom,
  };
}

/** Rupee or percent string from a DTO → stored value (paise or bps). */
export const commissionValue = (raw: string) => Math.round(Number(raw) * 100);

/** Referral codes: 4–20 letters/digits, stored upper-case. */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9]{4,20}$/;
export const normalizeCode = (c?: string | null) => (c ?? '').trim().toUpperCase();

/** Last 10 digits — "+919876543210" and "9876543210" are the same phone. */
export const phoneKey = (m?: string | null) => (m ?? '').replace(/\D/g, '').slice(-10);
