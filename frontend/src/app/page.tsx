'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { isAwaitingApproval, useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import { ORG_ADMIN_PERMS, canAny } from '@/lib/permissions';
import type { MeUser, PublicEvent } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { Alert, Badge, Button, Card, Empty, Field, Select, SectionTitle } from '@/components/ui';

function adminOrgs(me: MeUser) {
  return me.organizations.filter((o) => canAny(o.permissions, ORG_ADMIN_PERMS));
}

export default function HomePage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !me) return;
    if (isAwaitingApproval(me)) {
      router.replace('/awaiting');
      return;
    }
    // A plain volunteer with exactly one event goes straight to it.
    if (!me.isSuperAdmin && me.events.length === 1 && adminOrgs(me).length === 0) {
      router.replace(`/e/${me.events[0].id}`);
    }
  }, [loading, me, router]);

  return (
    <AppShell title="My festivals" subtitle={me ? `Hello, ${me.name}` : undefined}>
      {me && <Picker me={me} />}
    </AppShell>
  );
}

function Picker({ me }: { me: MeUser }) {
  const orgs = adminOrgs(me);
  return (
    <div className="flex flex-col gap-3">
      {(me.isSuperAdmin || orgs.length > 0) && (
        <div className="flex flex-col gap-2">
          {me.isSuperAdmin && (
            <Link href="/platform" className="flex min-h-[56px] items-center justify-between rounded-2xl bg-slate-900 px-4 font-semibold text-white">
              Platform admin <span aria-hidden>→</span>
            </Link>
          )}
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/org/${o.id}`}
              className="flex min-h-[56px] items-center justify-between rounded-2xl border border-slate-300 bg-white px-4 font-semibold"
            >
              <span>
                Manage {o.name}
                {o.role && <span className="ml-2 text-xs font-normal text-slate-500">{o.role.name}</span>}
              </span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
      )}

      <SectionTitle>Choose a festival</SectionTitle>
      {me.events.length === 0 ? (
        <NoEvents me={me} />
      ) : (
        me.events.map((ev) => (
          <Link key={ev.id} href={`/e/${ev.id}`} className="block">
            <Card className="transition-colors hover:border-brand-500 active:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-bold">{ev.name}</div>
                  <div className="text-sm text-slate-600">
                    {humanize(ev.festivalType)} · {ev.organization.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}
                  </div>
                </div>
                <Badge value={ev.status} />
              </div>
            </Card>
          </Link>
        ))
      )}
      {me.applications.some((a) => a.status === 'PENDING') && me.events.length > 0 && (
        <Alert kind="info">You have a volunteer request waiting for approval.</Alert>
      )}
    </div>
  );
}

function NoEvents({ me }: { me: MeUser }) {
  const { refresh } = useAuth();
  const [events, setEvents] = useState<PublicEvent[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<PublicEvent[]>('/public/events').then(setEvents).catch(() => setEvents([]));
  }, []);

  const rejected = me.applications.filter((a) => a.status === 'REJECTED');

  async function apply() {
    const ev = events?.find((e) => e.id === eventId);
    if (!ev) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/volunteer-applications', { organizationId: ev.organization.id, eventId: ev.id });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Empty title="You are not part of any festival yet">Ask your mandal organiser to add you, or send a request below.</Empty>
      {rejected.map((a) => (
        <Alert key={a.id} kind="warning">
          Your request to {a.organization.name} was not approved{a.reviewNote ? `: ${a.reviewNote}` : '.'}
        </Alert>
      ))}
      {events && events.length > 0 && (
        <Card>
          <Field label="Request to volunteer at" htmlFor="apply-ev">
            <Select id="apply-ev" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">— Choose a festival —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} · {ev.organization.name}
                </option>
              ))}
            </Select>
          </Field>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <Button className="mt-3 w-full" disabled={!eventId} loading={busy} onClick={apply}>
            Send request
          </Button>
        </Card>
      )}
    </div>
  );
}
