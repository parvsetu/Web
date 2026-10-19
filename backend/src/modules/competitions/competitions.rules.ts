import { BadRequestException } from '@nestjs/common';

export const COMPETITION_KINDS = ['SWIMMING', 'RUNNING', 'DANCE', 'ART', 'QUIZ', 'SPORTS', 'OTHER'] as const;
export const RESULT_TYPES = ['TIME', 'SCORE', 'RANK'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];
export const CATEGORY_GENDERS = ['ANY', 'MALE', 'FEMALE'] as const;
export const ENTRANT_GENDERS = ['MALE', 'FEMALE', 'OTHER'] as const;
export const RESULT_STATUSES = ['FINISHED', 'DNF', 'DNS', 'DQ'] as const;

/** An unpaid entry holds its spot this long. */
export const ENTRY_HOLD_MINUTES = 15;
export const MAX_CATEGORIES = 40;
export const MAX_COMPETITIONS_PER_EVENT = 50;
export const MAX_LANES = 12;
/** Below this age a guardian's name, phone and consent are required. */
export const ADULT_AGE = 18;
/**
 * GST on entry fees when the festival charges GST: added on top (the entrant pays it).
 * 18% is a placeholder — whether a mandal's competition entry fee is taxable, and at
 * what rate, is for its CA to confirm (same caveat as stall rent in stalls.rules.ts).
 */
export const COMPETITION_GST_RATE_BPS = 1800;

/** Age in whole years on `on` (both 'YYYY-MM-DD'). */
export function ageOn(dob: string, on: string): number {
  const [y1, m1, d1] = dob.split('-').map(Number);
  const [y2, m2, d2] = on.split('-').map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** null if the entrant fits the category, else the reason (shown to them). */
export function eligibility(c: { gender: string; minAge: number | null; maxAge: number | null }, gender: string, age: number): string | null {
  if (age < 3 || age > 100) return 'Please check the date of birth.';
  if (c.minAge !== null && age < c.minAge) return `This category is for ages ${c.minAge}${c.maxAge !== null ? `–${c.maxAge}` : '+'} on the competition day (the participant will be ${age}).`;
  if (c.maxAge !== null && age > c.maxAge) return `This category is for ages ${c.minAge ?? 0}–${c.maxAge} on the competition day (the participant will be ${age}).`;
  if (c.gender === 'MALE' && gender !== 'MALE') return 'This category is for boys / men.';
  if (c.gender === 'FEMALE' && gender !== 'FEMALE') return 'This category is for girls / women.';
  return null;
}

/** Fee, GST on top (only when the festival charges GST) and the platform's share of the fee before GST. */
export function quoteEntry(i: { feePaise: number; gstOn: boolean; commissionBps: number }) {
  const basePaise = i.feePaise;
  const gstRateBps = i.gstOn && basePaise > 0 ? COMPETITION_GST_RATE_BPS : 0;
  const gstPaise = Math.round((basePaise * gstRateBps) / 10000);
  const platformFeePaise = Math.min(basePaise, Math.round((basePaise * i.commissionBps) / 10000));
  return { basePaise, gstRateBps, gstPaise, amountPaise: basePaise + gstPaise, platformFeePaise };
}

/** "1:05.32", "65.32", "0:59", "1:02:03.5" → milliseconds. */
export function parseTime(raw: string): number {
  const bad = () => new BadRequestException('Enter the time as m:ss.hh, e.g. 1:05.32 (or seconds like 65.32).');
  const parts = raw.trim().split(':');
  if (parts.length > 3 || parts.some((p) => p === '')) throw bad();
  const last = parts.pop()!;
  const sm = (parts.length ? /^(\d{1,2})(?:\.(\d{1,3}))?$/ : /^(\d{1,5})(?:\.(\d{1,3}))?$/).exec(last);
  if (!sm || parts.some((p) => !/^\d{1,2}$/.test(p))) throw bad();
  const [h, m] = parts.length === 2 ? parts.map(Number) : [0, Number(parts[0] ?? 0)];
  const sec = Number(sm[1]);
  if ((parts.length && sec > 59) || (parts.length === 2 && m > 59)) throw bad();
  const ms = ((h * 60 + m) * 60 + sec) * 1000 + (sm[2] ? Number(sm[2].padEnd(3, '0')) : 0);
  if (ms <= 0 || ms >= 24 * 3600 * 1000) throw new BadRequestException('That time doesn’t look right.');
  return ms;
}

/** 65320 → "1:05.32"; 9500 → "9.50". */
export function formatTime(ms: number): string {
  const cs = Math.round(ms / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const frac = String(cs % 100).padStart(2, '0');
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${frac}`;
  return m ? `${m}:${String(s).padStart(2, '0')}.${frac}` : `${s}.${frac}`;
}

/**
 * Standard competition ranking (1, 2, 2, 4) among FINISHED entries: lower time wins,
 * higher score wins. Entries without a result or not finished get no rank.
 */
export function computeRanks<T extends { id: string; resultStatus: string | null; resultMs: number | null; resultScore: number | null }>(
  type: 'TIME' | 'SCORE', rows: T[],
): Map<string, number | null> {
  const val = (r: T) => (type === 'TIME' ? r.resultMs : r.resultScore);
  const done = rows.filter((r) => r.resultStatus === 'FINISHED' && val(r) !== null);
  done.sort((a, b) => (type === 'TIME' ? val(a)! - val(b)! : val(b)! - val(a)!));
  const out = new Map<string, number | null>(rows.map((r) => [r.id, null]));
  done.forEach((r, i) => {
    const prev = done[i - 1];
    out.set(r.id, prev && val(prev) === val(r) ? out.get(prev.id)! : i + 1);
  });
  return out;
}

/** "Riya Sharma" → "Riya S." — what the public results show (many entrants are children). */
export function publicName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

/** Fisher–Yates with a seed, so "assign heats" is repeatable for the same entries. */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Lane order that puts the first seeds in the middle lanes (e.g. 6 lanes → 3,4,2,5,1,6). */
export function centreOutLanes(lanes: number): number[] {
  const mid = Math.ceil(lanes / 2);
  const out = [mid];
  for (let d = 1; out.length < lanes; d++) {
    if (mid + d <= lanes) out.push(mid + d);
    if (mid - d >= 1 && out.length < lanes) out.push(mid - d);
  }
  return out;
}
