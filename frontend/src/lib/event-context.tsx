'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { DEFAULT_TZ } from './format';
import { ALL_PERMISSIONS } from './permissions';
import type { ApprovalStatus, EventDetail, EventStatus } from './types';

export interface EventCtx {
  eventId: string;
  /** Public page address (/f/<slug>); null until the detail loads or for unreadable events. */
  slug: string | null;
  /** Basic info (always available once loaded). */
  name: string;
  festivalType: string;
  status: EventStatus | null;
  approvalStatus: ApprovalStatus | null;
  /**
   * Reviewed and fee paid. Until then only set-up works (details, slots,
   * programme, photos); the API refuses passes, donations, stalls, volunteers,
   * competitions and expenses with EVENT_NOT_LIVE.
   */
  live: boolean;
  startDate: string;
  endDate: string;
  timezone: string;
  organization: { id: string; name: string } | null;
  /** Full detail from GET /events/:id, if the user may read it. */
  detail: EventDetail | null;
  perms: string[];
  loading: boolean;
  notFound: boolean;
  reloadDetail: () => void;
}

const Ctx = createContext<EventCtx | null>(null);

export function EventProvider({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const { me, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (authLoading || !me) return;
    let alive = true;
    setDetailLoading(true);
    api
      .get<EventDetail>(`/events/${eventId}`)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null))
      .finally(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId, me, authLoading, tick]);

  const value = useMemo<EventCtx>(() => {
    const fromMe = me?.events.find((e) => e.id === eventId) ?? null;
    const perms = me?.isSuperAdmin ? ALL_PERMISSIONS : (detail?.myPermissions ?? fromMe?.permissions ?? []);
    const base = detail ?? fromMe;
    const approvalStatus = detail?.approvalStatus ?? fromMe?.approvalStatus ?? null;
    return {
      eventId,
      slug: detail?.slug ?? null,
      name: base?.name ?? 'Festival',
      festivalType: base?.festivalType ?? '',
      status: base?.status ?? null,
      approvalStatus,
      // Unknown (not loaded yet) counts as live so nothing flickers away; the API is the real gate.
      live: approvalStatus ? approvalStatus === 'LIVE' : true,
      startDate: base?.startDate ?? '',
      endDate: base?.endDate ?? '',
      timezone: base?.timezone || DEFAULT_TZ,
      organization: base?.organization ?? null,
      detail,
      perms,
      loading: authLoading || (detailLoading && !fromMe),
      notFound: !authLoading && !detailLoading && !detail && !fromMe,
      reloadDetail: () => setTick((t) => t + 1),
    };
  }, [me, eventId, detail, detailLoading, authLoading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEvent(): EventCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEvent must be used under /e/[eventId]');
  return c;
}
