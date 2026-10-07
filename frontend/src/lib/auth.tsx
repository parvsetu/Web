'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from './api';
import type { AuthResponse, MeUser } from './types';

export interface RegisterResult {
  verificationRequired: boolean;
  email: string;
  maskedEmail: string;
}

interface AuthState {
  me: MeUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<MeUser | null>;
  login: (identifier: string, password: string) => Promise<MeUser>;
  register: (body: Record<string, unknown>) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<MeUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const user = await api.get<MeUser>('/auth/me');
      setMe(user);
      setError(null);
      return user;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your account.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { identifier, password }, { noAuthRedirect: true });
    setToken(res.accessToken);
    setMe(res.user);
    setError(null);
    return res.user;
  }, []);

  /** Creates the account; it stays inactive until the emailed code is verified. */
  const register = useCallback(async (body: Record<string, unknown>) => {
    return api.post<RegisterResult>('/auth/register', body, { noAuthRedirect: true });
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const res = await api.post<AuthResponse>('/auth/verify-email', { email, code }, { noAuthRedirect: true });
    setToken(res.accessToken);
    setMe(res.user);
    setError(null);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    if (typeof window !== 'undefined') window.location.replace('/login');
  }, []);

  const value = useMemo(
    () => ({ me, loading, error, refresh, login, register, verifyEmail, logout }),
    [me, loading, error, refresh, login, register, verifyEmail, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Redirects to /login when there is no session. Returns the auth state. */
export function useRequireAuth(): AuthState {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!auth.loading && !auth.me && !getToken()) {
      const next = typeof window !== 'undefined' ? encodeURIComponent(window.location.pathname) : '';
      router.replace(`/login${next ? `?next=${next}` : ''}`);
    }
  }, [auth.loading, auth.me, router]);
  return auth;
}

/**
 * Where a user lands after login: brands go to the partner portal and field
 * agents to the agent dashboard (never the mandal app); a mandal applicant who
 * has no mandal yet goes to the registration status page.
 */
export function homeFor(me: MeUser, next = DASHBOARD): string {
  if (me.partner) return next.startsWith('/partner') ? next : '/partner';
  if (me.agent) return next.startsWith('/agent') || next.startsWith('/profile') ? next : '/agent';
  if (me.vendor) return next.startsWith('/vendor') || next.startsWith('/profile') ? next : '/vendor';
  if (isApplicantOnly(me)) return next.startsWith('/registration') || next.startsWith('/profile') ? next : '/registration';
  if (isAwaitingApproval(me)) return '/awaiting';
  // "/" is the public explore page; a signed-in user's home is the dashboard.
  return next === '/' ? DASHBOARD : next;
}

/** The signed-in organiser / volunteer home ("My festivals"). */
export const DASHBOARD = '/dashboard';

/** Applied to register a mandal but has no mandal or festival access yet. */
export function isApplicantOnly(me: MeUser): boolean {
  return !me.partner && !me.agent && !me.vendor && !me.isSuperAdmin && me.organizations.length === 0 && me.events.length === 0 && (me.mandalRegistrations?.length ?? 0) > 0;
}

export function isAwaitingApproval(me: MeUser): boolean {
  if (me.partner || me.agent || me.vendor || isApplicantOnly(me)) return false;
  return (
    !me.isSuperAdmin &&
    me.organizations.length === 0 &&
    me.events.length === 0 &&
    me.applications.some((a) => a.status === 'PENDING')
  );
}
