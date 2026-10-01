// Fetch helper for the public pass-booking API. Deliberately separate from
// `lib/api.ts`: no bearer token, no 401 → /login redirect. The server is the
// authority on price, capacity and payment state — nothing here decides them.

import { API_URL } from './api';
import type {
  Availability,
  BookableEvent,
  BookableEventDetail,
  BookingLocation,
  CreatePassOrderBody,
  CreatedPassOrder,
  Pass,
  PassOrder,
  SavedPass,
} from './booking-types';

const TIMEOUT_MS = 10_000;

/** Any failed booking request. `status` 0 = never reached the server. */
export class BookingError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
    this.code = code;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

function friendly(status: number, raw: unknown): string {
  if (status === 429) return 'Too many attempts from this device. Please wait a minute and try again.';
  if (status >= 500 && status !== 503) return 'The booking service had a problem. Please try again in a moment.';
  if (Array.isArray(raw) && raw.length) return raw.map(String).join('. ');
  if (typeof raw === 'string' && raw && !raw.startsWith('ThrottlerException')) return raw;
  if (status === 404) return 'Not found.';
  if (status === 503) return 'Online payment is not available for this festival right now.';
  return 'Something went wrong. Please try again.';
}

type Query = Record<string, string | number | undefined | null>;

async function call<T>(method: 'GET' | 'POST', path: string, opts: { query?: Query; body?: unknown } = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
      cache: 'no-store',
    });
  } catch (e) {
    const timedOut = e instanceof DOMException && e.name === 'AbortError';
    throw new BookingError(
      0,
      timedOut ? 'The request took too long. Check your connection and try again.' : 'Could not reach the server. Check your internet connection.',
      timedOut ? 'TIMEOUT' : 'NETWORK',
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const body = (data ?? {}) as { message?: unknown; code?: unknown };
    throw new BookingError(res.status, friendly(res.status, body.message), typeof body.code === 'string' ? body.code : undefined);
  }
  return data as T;
}

export const booking = {
  locations: () => call<BookingLocation[]>('GET', '/public/locations'),
  events: (q: { state?: string; city?: string; q?: string }) => call<BookableEvent[]>('GET', '/public/booking/events', { query: q }),
  event: (eventId: string) => call<BookableEventDetail>('GET', `/public/booking/events/${encodeURIComponent(eventId)}`),
  availability: (eventId: string, date: string) =>
    call<Availability>('GET', `/public/booking/events/${encodeURIComponent(eventId)}/availability`, { query: { date } }),
  createOrder: (body: CreatePassOrderBody) => call<CreatedPassOrder>('POST', '/public/booking/orders', { body }),
  order: (orderId: string, k: string) => call<PassOrder>('GET', `/public/booking/orders/${encodeURIComponent(orderId)}`, { query: { k } }),
  demoPay: (orderId: string, k: string, outcome: 'success' | 'fail') =>
    call<PassOrder>('POST', `/public/booking/orders/${encodeURIComponent(orderId)}/demo-pay`, { body: { k, outcome } }),
  sponsors: (eventId: string) => call<import('@/components/SponsorStrip').SponsorPublic[]>('GET', `/public/events/${encodeURIComponent(eventId)}/sponsors`),
};

export function bookingErrorMessage(e: unknown): string {
  if (e instanceof BookingError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

// ─── Links ───────────────────────────────────────────────────────────────

export const passHref = (orderId: string, k: string) => `/pass/${encodeURIComponent(orderId)}?k=${encodeURIComponent(k)}`;
export const demoPayHref = (orderId: string, k: string) => `/pay/demo/${encodeURIComponent(orderId)}?k=${encodeURIComponent(k)}`;

// ─── Passes saved on this device ─────────────────────────────────────────

const SAVED_KEY = 'parvsetu.myPasses';

export function loadSavedPasses(): SavedPass[] {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (p): p is SavedPass => !!p && typeof p === 'object' && typeof (p as SavedPass).orderId === 'string' && typeof (p as SavedPass).accessKey === 'string',
    );
  } catch {
    return [];
  }
}

function writeSaved(list: SavedPass[]) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* private mode / storage full — the pass link itself still works */
  }
}

/** Insert or refresh a saved pass (keeps the original createdAt, newest first). */
export function savePass(p: SavedPass) {
  const list = loadSavedPasses();
  const existing = list.find((x) => x.orderId === p.orderId);
  const rest = list.filter((x) => x.orderId !== p.orderId);
  writeSaved([{ ...p, createdAt: existing?.createdAt ?? p.createdAt }, ...rest]);
}

export function removeSavedPass(orderId: string) {
  writeSaved(loadSavedPasses().filter((x) => x.orderId !== orderId));
}

// ─── Display helpers (event timezone) ────────────────────────────────────

function fmt(iso: string, tz: string, o: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-IN', { ...o, timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-IN', o).format(d);
  }
}

/** "Thu, 1 Oct 2026" in the event timezone. */
export const fmtPassDay = (iso: string, tz: string) => fmt(iso, tz, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
/** "5:00 pm" in the event timezone. */
export const fmtPassTime = (iso: string, tz: string) => fmt(iso, tz, { hour: 'numeric', minute: '2-digit', hour12: true });

/** "Thu, 1 Oct 2026 · 5:00 pm – 7:00 pm" (end day shown when it differs). */
export function fmtPassWindow(from: string, until: string, tz: string): string {
  const d1 = fmtPassDay(from, tz);
  const d2 = fmtPassDay(until, tz);
  return d1 === d2
    ? `${d1} · ${fmtPassTime(from, tz)} – ${fmtPassTime(until, tz)}`
    : `${d1}, ${fmtPassTime(from, tz)} – ${d2}, ${fmtPassTime(until, tz)}`;
}

/** "17:00" → "5 pm", "17:30" → "5:30 pm". */
export function fmtHHmm(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m[2] === '00' ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
}

/** Every calendar day from start to end inclusive (YYYY-MM-DD, no tz shifting). */
export function festivalDays(start: string, end: string, cap = 60): string[] {
  const p = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
  };
  const a = p(start);
  const b = p(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return [];
  const out: string[] = [];
  for (let t = a; t <= b && out.length < cap; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function dayParts(date: string): { weekday: string; day: string; month: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return { weekday: '', day: date, month: '' };
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...o, timeZone: 'UTC' }).format(d);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

/** Accepts "98765 43210", "+91 9876543210", "09876543210" → "9876543210" or null. */
export function normalizeIndianMobile(input: string): string | null {
  let d = input.replace(/[\s()-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** All passes on an order — tolerates servers that only send `pass`. */
export function orderPasses(o: PassOrder): Pass[] {
  if (Array.isArray(o.passes) && o.passes.length) return o.passes;
  return o.pass ? [o.pass] : [];
}

export const isFree = (price: string | null | undefined) => price !== null && price !== undefined && Number(price) === 0;
