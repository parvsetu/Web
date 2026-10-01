// The single typed API client. Every request goes through `request()`.
// Business rules live on the server — this module only transports data.

import type { ApiErrorBody } from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

const TOKEN_KEY = 'parvsetu.accessToken';

export function getToken(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — session will not persist */
  }
}

/** Thrown for any non-2xx response. `message` is always a display string. */
export class ApiError extends Error {
  status: number;
  code?: string;
  messages: string[];
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null, fallback: string) {
    const raw = body?.message;
    const messages = Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [fallback];
    super(messages.join('. '));
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code;
    this.messages = messages;
    this.body = body;
  }
}

/** Thrown when the request never got a response (offline, DNS, timeout). */
export class NetworkError extends Error {
  timedOut: boolean;
  constructor(timedOut: boolean) {
    super(timedOut ? 'The request timed out.' : 'Unable to reach the server. Please check your internet connection.');
    this.name = 'NetworkError';
    this.timedOut = timedOut;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  timeoutMs?: number;
  /** Don't redirect to /login on 401 (used by the login form itself). */
  noAuthRedirect?: boolean;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

function handleUnauthorized() {
  setToken(null);
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace(`/login?next=${next}`);
  }
}

async function rawFetch(path: string, opts: RequestOptions, accept?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accept) headers.Accept = accept;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  let timedOut = false;
  const timer = opts.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, opts.timeoutMs)
    : null;
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch {
    throw new NetworkError(timedOut);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (res.status === 401 && !opts.noAuthRedirect) handleUnauthorized();
  return res;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const fallback =
    res.status === 403
      ? 'You do not have permission to do this.'
      : res.status === 404
        ? 'Not found.'
        : res.status === 429
          ? 'Too many requests. Please wait a moment and try again.'
          : `Request failed (${res.status}).`;
  return new ApiError(res.status, body, fallback);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await rawFetch(path, opts, 'application/json');
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, opts?: Omit<RequestOptions, 'query' | 'method'>) =>
    request<T>(path, { ...opts, query, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'POST' }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'PATCH' }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...opts, body: body ?? {}, method: 'PUT' }),
  del: <T>(path: string, opts?: Omit<RequestOptions, 'method'>) => request<T>(path, { ...opts, method: 'DELETE' }),
};

/** Fetch a binary/CSV resource with the bearer token and return it as a Blob. */
export async function fetchBlob(path: string, query?: Query): Promise<Blob> {
  const res = await rawFetch(path, { query });
  if (!res.ok) throw await parseError(res);
  return res.blob();
}

/** Download a resource (e.g. CSV export) through fetch+bearer, never a plain link. */
export async function downloadFile(path: string, query: Query, filename: string): Promise<void> {
  const blob = await fetchBlob(path, query);
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Some list endpoints aren't explicit about paging — accept either a bare array or a Paged<T>. */
export function asArray<T>(x: T[] | { items: T[] } | null | undefined): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : Array.isArray(x.items) ? x.items : [];
}
