'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from './api';
import type { AuthResponse, MeUser } from './types';

interface AuthState {
  me: MeUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<MeUser | null>;
  login: (identifier: string, password: string) => Promise<MeUser>;
  register: (body: Record<string, unknown>) => Promise<MeUser>;
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

  const register = useCallback(async (body: Record<string, unknown>) => {
    const res = await api.post<AuthResponse>('/auth/register', body, { noAuthRedirect: true });
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
    () => ({ me, loading, error, refresh, login, register, logout }),
    [me, loading, error, refresh, login, register, logout],
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

export function isAwaitingApproval(me: MeUser): boolean {
  return (
    !me.isSuperAdmin &&
    me.organizations.length === 0 &&
    me.events.length === 0 &&
    me.applications.some((a) => a.status === 'PENDING')
  );
}
