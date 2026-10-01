'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtNum, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { EVENT_ADMIN_PERMS, ORG_ADMIN_PERMS, can, canAny } from '@/lib/permissions';
import type { MySummary } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { Alert, Badge, Card, Skeleton, Stat } from '@/components/ui';

export default function VolunteerHome() {
  const ev = useEvent();
  return (
    <AppShell title={ev.name} subtitle={ev.organization?.name} back="/">
      <EventGate>
        <Home />
      </EventGate>
    </AppShell>
  );
}

function Home() {
  const ev = useEvent();
  const { me } = useAuth();
  const canScan = can(ev.perms, 'TOKEN_SCAN');
  const canIssue = can(ev.perms, 'TOKEN_CREATE');
  const summary = useAsync(() => api.get<MySummary>(`/events/${ev.eventId}/my-summary`), [ev.eventId], canScan || canIssue);
  const isAdmin = canAny(ev.perms, EVENT_ADMIN_PERMS);
  const orgId = ev.organization?.id;
  const orgAdmin = !!orgId && (me?.isSuperAdmin || canAny(me?.organizations.find((o) => o.id === orgId)?.permissions, ORG_ADMIN_PERMS));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        {ev.festivalType && <span>{humanize(ev.festivalType)}</span>}
        {ev.status && <Badge value={ev.status} />}
      </div>

      {ev.status && ev.status !== 'ACTIVE' && canScan && (
        <Alert kind="warning">Scanning works only while the festival is Active. It is currently {humanize(ev.status)}.</Alert>
      )}

      {(canScan || canIssue) && (
        <div className="grid grid-cols-2 gap-3">
          {summary.loading ? (
            <>
              <Skeleton className="h-20" />
              <Skeleton className="h-20" />
            </>
          ) : summary.data ? (
            <>
              <Stat label="Today's visitors" value={fmtNum(summary.data.today.visitors)} tone="brand" />
              <Stat label="Successful entries" value={fmtNum(summary.data.today.entries)} tone="green" />
            </>
          ) : null}
        </div>
      )}
      {summary.error && <Alert kind="warning">Could not load today&apos;s numbers. {summary.error}</Alert>}

      {canScan && (
        <Link
          href={`/e/${ev.eventId}/scan`}
          className="flex min-h-[120px] flex-col items-center justify-center gap-1 rounded-3xl bg-brand-600 text-white shadow-lg active:bg-brand-800"
        >
          <span aria-hidden className="text-4xl">⌗</span>
          <span className="text-2xl font-extrabold tracking-wide">SCAN QR TOKEN</span>
        </Link>
      )}
      {canIssue && (
        <Link
          href={`/e/${ev.eventId}/issue`}
          className="flex min-h-[80px] items-center justify-center rounded-3xl border-2 border-slate-900 bg-white text-xl font-extrabold tracking-wide text-slate-900 active:bg-slate-100"
        >
          ISSUE TOKEN
        </Link>
      )}

      {canScan && summary.data && (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">My activity today</h2>
            <Link href={`/e/${ev.eventId}/my-scans`} className="min-h-[44px] content-center text-sm font-semibold text-brand-700 underline">
              My scans →
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <MiniStat label="Scans" value={summary.data.me.scans} />
            <MiniStat label="Allowed" value={summary.data.me.successful} tone="text-green-700" />
            <MiniStat
              label="Denied"
              value={summary.data.me.duplicate + summary.data.me.expired + summary.data.me.notYetValid + summary.data.me.invalid + summary.data.me.other}
              tone="text-red-700"
            />
          </div>
          {summary.data.me.lastActiveAt && <p className="mt-2 text-xs text-slate-500">Last scan: {fmtDateTime(summary.data.me.lastActiveAt, ev.timezone)}</p>}
        </Card>
      )}

      {!canScan && !canIssue && !isAdmin && <Alert kind="info">You have no tasks for this festival yet.</Alert>}

      {(isAdmin || orgAdmin) && (
        <div className="flex flex-col gap-2 pt-2">
          {isAdmin && (
            <Link href={`/e/${ev.eventId}/admin`} className="flex min-h-[52px] items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 font-semibold">
              Festival dashboard <span aria-hidden>→</span>
            </Link>
          )}
          {orgAdmin && orgId && (
            <Link href={`/org/${orgId}`} className="flex min-h-[52px] items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 font-semibold">
              Mandal admin <span aria-hidden>→</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className={`text-2xl font-bold tabular-nums ${tone ?? ''}`}>{fmtNum(value)}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
