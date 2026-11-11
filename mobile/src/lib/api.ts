// One fetch path for the whole app. The server decides prices, capacity,
// payment state and scan verdicts — nothing here infers them.

import * as SecureStore from 'expo-secure-store';
import { API_URL } from './config';

const TOKEN_KEY = 'parvsetu.accessToken';

/** Any failed request. `status` 0 = never reached the server (no signal, timeout). */
export class ApiError extends Error {
  status: number;
  code?: string;
  timedOut: boolean;
  constructor(status: number, message: string, code?: string, timedOut = false) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.timedOut = timedOut;
  }
  get isNetwork() {
    return this.status === 0;
  }
}

export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;

let cachedToken: string | null | undefined;
const authListeners = new Set<() => void>();

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Keychain unavailable: the session lasts until the app closes.
  }
  authListeners.forEach((l) => l());
}

/** Called when the session ends (logout or a 401). */
export function onAuthChange(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

function friendly(status: number, raw: unknown): string {
  if (status === 429) return 'Too many attempts from this phone. Please wait a minute and try again.';
  if (status >= 500 && status !== 503) return 'The server had a problem. Please try again in a moment.';
  if (Array.isArray(raw) && raw.length) return raw.map(String).join('. ');
  if (typeof raw === 'string' && raw && !raw.startsWith('ThrottlerException')) return raw;
  if (status === 404) return 'Not found.';
  if (status === 503) return 'This service is not available right now.';
  return 'Something went wrong. Please try again.';
}

type Query = Record<string, string | number | undefined | null>;
type Opts = { query?: Query; body?: unknown; auth?: boolean; timeoutMs?: number; retryRead?: boolean };

// The API sleeps when idle (free hosting) and can take up to a minute to wake.
const GET_TIMEOUT_MS = 60_000;
const POST_TIMEOUT_MS = 30_000;

export async function request<T>(method: 'GET' | 'POST', path: string, opts: Opts = {}): Promise<T> {
  const qs = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${API_URL}${path}${qs ? `?${qs}` : ''}`;
  try {
    return await attempt<T>(method, url, opts);
  } catch (e) {
    // A sleeping server often drops the first request: retry reads once.
    if (method === 'GET' && opts.retryRead !== false && e instanceof ApiError && e.status === 0) return attempt<T>(method, url, opts);
    throw e;
  }
}

async function attempt<T>(method: 'GET' | 'POST', url: string, opts: Opts): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? (method === 'GET' ? GET_TIMEOUT_MS : POST_TIMEOUT_MS));
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, timedOut ? 'The server took too long to respond.' : 'Could not reach the server. Check your internet connection.', timedOut ? 'TIMEOUT' : 'NETWORK', timedOut);
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
    if (res.status === 401 && opts.auth) await setToken(null);
    const body = (data ?? {}) as { message?: unknown; code?: unknown };
    const err = new ApiError(res.status, friendly(res.status, body.message), typeof body.code === 'string' ? body.code : undefined);
    (err as ApiError & { body?: unknown }).body = data;
    throw err;
  }
  return data as T;
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
