// Volunteer / staff session. Only the gate needs a login; visitors never do.
// The access token lives in the Keychain / Keystore (expo-secure-store).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, getToken, onAuthChange, request, setToken } from './api';
import type { MeEvent, MeUser } from './types';

interface AuthState {
  loading: boolean;
  user: MeUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeUser | null>(null);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      setUser(await request<MeUser>('GET', '/auth/me', { auth: true }));
    } catch (e) {
      // Offline: keep whatever we had; a 401 already cleared the token.
      if (e instanceof ApiError && e.status === 401) setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    return onAuthChange(() => {
      void getToken().then((t) => {
        if (!t) setUser(null);
      });
    });
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await request<{ accessToken: string; user: MeUser }>('POST', '/auth/login', { body: { identifier: identifier.trim(), password } });
    await setToken(res.accessToken);
    // /auth/me carries the per-event permissions; the login payload may not.
    try {
      setUser(await request<MeUser>('GET', '/auth/me', { auth: true }));
    } catch {
      setUser(res.user);
    }
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ loading, user, login, logout, refresh }), [loading, user, login, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Festivals this user can scan at. Super admins pass every server check. */
export function scannableEvents(user: MeUser | null): MeEvent[] {
  if (!user) return [];
  return user.events.filter((e) => user.isSuperAdmin || e.permissions.includes('TOKEN_SCAN'));
}

/** UI hint only — the server refuses scans for festivals that aren't live. */
export const isLive = (e: MeEvent) => (e.approvalStatus ? e.approvalStatus === 'LIVE' : true);
