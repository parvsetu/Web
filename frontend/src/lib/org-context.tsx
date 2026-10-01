'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { orgPerms } from './permissions';
import type { Organization } from './types';

export interface OrgCtx {
  orgId: string;
  name: string;
  org: Organization | null;
  perms: string[];
  loading: boolean;
  reload: () => void;
}

const Ctx = createContext<OrgCtx | null>(null);

export function OrgProvider({ orgId, children }: { orgId: string; children: React.ReactNode }) {
  const { me, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (authLoading || !me) return;
    let alive = true;
    setLoading(true);
    api
      .get<Organization>(`/organizations/${orgId}`)
      .then((o) => alive && setOrg(o))
      .catch(() => alive && setOrg(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [orgId, me, authLoading, tick]);

  const value = useMemo<OrgCtx>(() => {
    const fromMe = me?.organizations.find((o) => o.id === orgId);
    return {
      orgId,
      name: org?.name ?? fromMe?.name ?? 'Mandal',
      org,
      perms: orgPerms(me, orgId),
      loading: authLoading || (loading && !fromMe),
      reload: () => setTick((t) => t + 1),
    };
  }, [me, orgId, org, loading, authLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg(): OrgCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useOrg must be used under /org/[orgId]');
  return c;
}
