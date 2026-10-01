// Display formatting. Timestamps are UTC ISO strings; calendar dates are
// YYYY-MM-DD in the event's timezone.

export const DEFAULT_TZ = 'Asia/Kolkata';

function safeTz(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

export function fmtDateTime(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: safeTz(tz),
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

export function fmtTime(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: safeTz(tz),
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(d);
}

/** Format a calendar date string (YYYY-MM-DD) without timezone shifting. */
export function fmtDate(date: string | null | undefined): string {
  if (!date) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** Today's calendar date (YYYY-MM-DD) in the given timezone. */
export function todayIn(tz?: string | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz(tz) ?? DEFAULT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Clamp a YYYY-MM-DD date to [start, end]. */
export function clampDate(date: string, start: string, end: string): string {
  const s = start.slice(0, 10);
  const e = end.slice(0, 10);
  if (date < s) return s;
  if (date > e) return e;
  return date;
}

export function fmtMoney(amount: string | number | null | undefined, currency = 'INR'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n)) return String(amount);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₹${n.toFixed(2)}`;
  }
}

export function fmtNum(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isNaN(v) ? String(n) : new Intl.NumberFormat('en-IN').format(v);
}

export function fmtHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
}

/** Converts a datetime-local input value (local wall clock) to an ISO UTC string. */
export function localInputToIso(v: string): string {
  return new Date(v).toISOString();
}

/** Converts an ISO string to a datetime-local input value in the browser's local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function humanize(key: string | null | undefined): string {
  if (!key) return '—';
  return key
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Fallback for older browsers / insecure contexts: RFC4122 v4 from getRandomValues.
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Current wall-clock time (HH:mm, 24h) in the given timezone. */
export function nowHHmmIn(tz?: string | null): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTz(tz) ?? DEFAULT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

/** Pass-duration presets offered in settings and at the token desk. */
export const DURATION_PRESETS = [1, 2, 3, 4, 6, 8, 12, 24, 48, 72];

export function durationLabel(hours: number): string {
  if (hours % 24 === 0) return hours === 24 ? '1 day' : `${hours / 24} days`;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}
