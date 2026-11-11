// Dates are shown in the festival's own timezone; money in en-IN rupees.

function fmt(iso: string, tz: string, o: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: tz || 'Asia/Kolkata', ...o }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export const fmtDay = (iso: string, tz: string) => fmt(iso, tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (iso: string, tz: string) => fmt(iso, tz, { hour: 'numeric', minute: '2-digit', hour12: true });
export const fmtDateTime = (iso: string, tz = 'Asia/Kolkata') => `${fmtDay(iso, tz)}, ${fmtTime(iso, tz)}`;

export function fmtPassWindow(from: string, until: string, tz: string): string {
  const a = fmtDay(from, tz);
  const b = fmtDay(until, tz);
  return a === b ? `${a}, ${fmtTime(from, tz)} – ${fmtTime(until, tz)}` : `${a}, ${fmtTime(from, tz)} – ${b}, ${fmtTime(until, tz)}`;
}

/** "18:30" → "6:30 pm" */
export function fmtHHmm(t: string): string {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

export function fmtMoney(amount: string | number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
}

export const isFree = (price: string | null | undefined) => price !== null && price !== undefined && Number(price) === 0;

/** Every calendar day of the festival (YYYY-MM-DD strings), capped. */
export function festivalDays(start: string, end: string, cap = 60): string[] {
  const out: string[] = [];
  const d = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const last = new Date(`${end.slice(0, 10)}T00:00:00Z`);
  while (d <= last && out.length < cap) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Today's date in a timezone as YYYY-MM-DD. */
export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

export function festivalTypeLabel(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type SalesState = 'NOT_YET' | 'OPEN' | 'CLOSED';

/** Same rule as the API (common/booking-window.ts): null ends are open. The server re-checks on order. */
export function salesStateAt(opensAt: string | null | undefined, closesAt: string | null | undefined, now = Date.now()): SalesState {
  if (opensAt && now < new Date(opensAt).getTime()) return 'NOT_YET';
  if (closesAt && now >= new Date(closesAt).getTime()) return 'CLOSED';
  return 'OPEN';
}
