'use client';

import { API_URL, api } from './api';
import { isStandalone } from '@/components/InstallPrompt';

/**
 * Web push on this phone/browser. iPhones only allow it for sites added to
 * the home screen (iOS 16.4+), so there `needsInstall` comes back first.
 */
export type PushSupport = 'ok' | 'needs-install' | 'unsupported' | 'denied';

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function b64ToBytes(b64: string) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** The current subscription, if this browser has one (no permission prompt). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'ok') return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Asks for permission (must be called from a tap) and returns this browser's subscription. */
export async function ensureSubscription(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'denied' : 'dismissed');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  const res = await fetch(`${API_URL}/public/push/key`, { cache: 'no-store' });
  const { publicKey } = (await res.json()) as { publicKey: string };
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
}

const body = (s: PushSubscription, lang?: string) => {
  const j = s.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth }, ...(lang ? { lang } : {}) };
};

/** Visitor: remind this phone about one pass (order id + access key). */
export async function remindMeAboutPass(orderId: string, k: string, lang: string) {
  const s = await ensureSubscription();
  const res = await fetch(`${API_URL}/public/booking/orders/${encodeURIComponent(orderId)}/push`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, subscription: body(s, lang) }),
  });
  if (!res.ok) throw new Error('Could not turn on reminders. Try again.');
}

/** Signed-in: this phone gets my notifications. */
export async function enableAccountPush() {
  const s = await ensureSubscription();
  await api.post('/push/subscriptions', body(s, 'en'));
}

export async function accountPushEnabled() {
  const s = await currentSubscription();
  if (!s) return false;
  const r = await api.get<{ subscribed: boolean }>('/push/subscriptions/status', { endpoint: s.endpoint });
  return r.subscribed;
}

/** Turns notifications off on this phone (for every pass and account on it). */
export async function disablePush() {
  const s = await currentSubscription();
  if (!s) return;
  await fetch(`${API_URL}/public/push/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: s.endpoint }) }).catch(() => undefined);
  await s.unsubscribe().catch(() => undefined);
}

const REMINDED_KEY = 'parvsetu.reminders';
/** Passes this phone asked to be reminded about (to show "Reminder on"). */
export function remindedOrders(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(REMINDED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
export function markReminded(orderId: string) {
  try {
    window.localStorage.setItem(REMINDED_KEY, JSON.stringify([...new Set([orderId, ...remindedOrders()])].slice(0, 100)));
  } catch {
    /* ignore */
  }
}
