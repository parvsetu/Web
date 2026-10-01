'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { isApplicantOnly, isAwaitingApproval, useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import { ORG_ADMIN_PERMS, canAny } from '@/lib/permissions';
import type { MeUser, PublicEvent } from '@/lib/types';
import { Building2, CalendarDays, ChevronRight, ClipboardCheck, PartyPopper, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { AppShell } from '@/components/AppShell';
import { FestivalArt, Mandala } from '@/components/FestivalArt';
import { Alert, Badge, Button, Card, Empty, Field, Select, SectionTitle } from '@/components/ui';

function adminOrgs(me: MeUser) {
  return me.organizations.filter((o) => canAny(o.permissions, ORG_ADMIN_PERMS));
}

/** Signed-in organiser / volunteer home ("My festivals"). The public explore page is at /. */
export default function DashboardPage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !me) return;
    if (me.partner) {
      router.replace('/partner');
      return;
    }
    if (me.agent) {
      router.replace('/agent');
      return;
    }
    if (isApplicantOnly(me)) {
      router.replace('/registration');
      return;
    }
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
      {me && !me.partner && !me.agent && <Picker me={me} />}
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
            <Link
              href="/platform"
              className="flex min-h-[60px] items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 font-semibold text-white shadow-md shadow-violet-500/25"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
                <ShieldCheck aria-hidden className="h-5 w-5" />
              </span>
              <span className="flex-1">Platform admin</span>
              <ChevronRight aria-hidden className="h-5 w-5" />
            </Link>
          )}
          {orgs.map((o) => (
            <Link
              key={o.id}
              href={`/org/${o.id}`}
              className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 font-semibold shadow-sm hover:bg-orange-50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                <Building2 aria-hidden className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">Manage {o.name}</span>
                {o.role && <span className="block text-xs font-normal text-slate-500">{o.role.name}</span>}
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 text-orange-400" />
            </Link>
          ))}
        </div>
      )}

      <SectionTitle icon={PartyPopper}>Choose a festival</SectionTitle>
      {me.events.length === 0 ? (
        <NoEvents me={me} />
      ) : (
        me.events.map((ev) => {
          const t = festivalTheme(ev.festivalType);
          return (
            <Link key={ev.id} href={`/e/${ev.id}`} className="group block">
              <div className="flex overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:shadow-lg group-active:scale-[0.99]">
                <div className="relative flex w-28 shrink-0 items-center justify-center" style={{ background: gradient(t) }}>
                  <Mandala className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 text-white/20" />
                  <span className="relative h-20 w-20 rounded-full bg-white/95 p-2 shadow-md">
                    <FestivalArt type={ev.festivalType} className="h-full w-full" />
                  </span>
                </div>
                <div className="min-w-0 flex-1 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider" style={{ color: t.ink }}>
                      {t.label === 'Festival' ? humanize(ev.festivalType) : t.label}
                    </div>
                    <Badge value={ev.status} />
                  </div>
                  <div className="mt-0.5 text-lg font-extrabold leading-tight text-slate-900">{ev.name}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <Building2 aria-hidden className="h-4 w-4 text-slate-400" /> <span className="truncate">{ev.organization.name}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
                    <CalendarDays aria-hidden className="h-4 w-4 text-slate-400" /> {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}
                  </div>
                </div>
                <div className="flex items-center pr-3 text-orange-300 group-hover:text-orange-500">
                  <ChevronRight aria-hidden className="h-6 w-6" />
                </div>
              </div>
            </Link>
          );
        })
      )}
      {(me.mandalRegistrations?.length ?? 0) > 0 && (
        <Link href="/registration" className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-900 hover:bg-emerald-100">
          <ClipboardCheck aria-hidden className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">Mandal registration &amp; festival fees</span>
          <ChevronRight aria-hidden className="h-5 w-5" />
        </Link>
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
      <Empty icon={Sparkles} title="You are not part of any festival yet">Ask your mandal organiser to add you, or send a request below.</Empty>
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
            {!busy && <Send aria-hidden className="h-5 w-5" />}
            Send request
          </Button>
        </Card>
      )}
    </div>
  );
}
