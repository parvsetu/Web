// Public (no-login) booking and the visitor's saved passes. Passes are kept on
// the phone — order id + access key, plus the last copy of each order — so a
// pass still opens at the gate with no signal.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { request } from './api';
import type { Availability, BookableEvent, BookableEventDetail, CreatedPassOrder, Pass, PassOrder, SavedPass } from './types';

export const booking = {
  events: (q: { q?: string; city?: string; state?: string }) => request<BookableEvent[]>('GET', '/public/booking/events', { query: q }),
  event: (id: string) => request<BookableEventDetail>('GET', `/public/booking/events/${encodeURIComponent(id)}`),
  availability: (id: string, date: string) =>
    request<Availability>('GET', `/public/booking/events/${encodeURIComponent(id)}/availability`, { query: { date } }),
  createOrder: (body: { eventId: string; timeSlotId: string; date: string; visitorCount: number; buyerName: string; buyerMobile: string; buyerEmail?: string }) =>
    request<CreatedPassOrder>('POST', '/public/booking/orders', { body }),
  order: (id: string, k: string) => request<PassOrder>('GET', `/public/booking/orders/${encodeURIComponent(id)}`, { query: { k } }),
  demoPay: (id: string, k: string, outcome: 'success' | 'fail') =>
    request<PassOrder>('POST', `/public/booking/orders/${encodeURIComponent(id)}/demo-pay`, { body: { k, outcome } }),
};

const SAVED_KEY = 'parvsetu.myPasses';
const ORDER_CACHE = 'parvsetu.order.';

export async function loadSavedPasses(): Promise<SavedPass[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((p): p is SavedPass => !!p && typeof p === 'object' && typeof p.orderId === 'string' && typeof p.accessKey === 'string')
      : [];
  } catch {
    return [];
  }
}

async function writeSaved(list: SavedPass[]) {
  try {
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // storage full / unavailable — the pass link still works online
  }
}

export async function savePass(p: SavedPass) {
  const list = (await loadSavedPasses()).filter((x) => x.orderId !== p.orderId);
  await writeSaved([p, ...list]);
}

export async function removeSavedPass(orderId: string) {
  await writeSaved((await loadSavedPasses()).filter((x) => x.orderId !== orderId));
  await AsyncStorage.removeItem(ORDER_CACHE + orderId).catch(() => undefined);
}

export interface CachedOrder {
  order: PassOrder;
  savedAt: string;
}

export async function cacheOrder(o: PassOrder) {
  try {
    await AsyncStorage.setItem(ORDER_CACHE + o.id, JSON.stringify({ order: o, savedAt: new Date().toISOString() } satisfies CachedOrder));
  } catch {
    // ignore
  }
}

/** The last copy of an order, only for a pass saved on this phone with the same key. */
export async function cachedOrder(orderId: string, accessKey: string): Promise<CachedOrder | null> {
  const saved = await loadSavedPasses();
  if (!saved.some((p) => p.orderId === orderId && p.accessKey === accessKey)) return null;
  try {
    const raw = await AsyncStorage.getItem(ORDER_CACHE + orderId);
    return raw ? (JSON.parse(raw) as CachedOrder) : null;
  } catch {
    return null;
  }
}

/** A pass link from WhatsApp / SMS / email (…/pass/<orderId>?k=<key>). Null when it isn't one. */
export function parsePassLink(text: string): { orderId: string; accessKey: string } | null {
  const m = text.trim().match(/\/pass\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?\?(?:[^#\s]*&)?k=([A-Za-z0-9_-]{20,64})/i);
  return m ? { orderId: m[1].toLowerCase(), accessKey: decodeURIComponent(m[2]) } : null;
}

/** All passes on an order — tolerates servers that only send `pass`. */
export function orderPasses(o: PassOrder): Pass[] {
  if (Array.isArray(o.passes) && o.passes.length) return o.passes;
  return o.pass ? [o.pass] : [];
}

export function normalizeIndianMobile(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
