"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useEvent } from "@/lib/event-context";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock,
  ScanLine,
  ShieldX,
  Ticket,
  Users,
} from "lucide-react";
import { fmtDate, fmtDateTime, fmtNum, humanize } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import {
  EVENT_ADMIN_PERMS,
  ORG_ADMIN_PERMS,
  can,
  canAny,
} from "@/lib/permissions";
import type { MySummary } from "@/lib/types";
import { AppShell } from "@/components/AppShell";
import { EventGate } from "@/components/EventGate";
import { FestivalBanner } from "@/components/FestivalBanner";
import { SponsorStrip, type SponsorPublic } from "@/components/SponsorStrip";
import {
  CreditBanner,
  IssueAllowance,
  type EventAllowance,
} from "@/components/org/CreditTab";
import { Alert, Badge, Card, Skeleton, Stat } from "@/components/ui";

export default function VolunteerHome() {
  const ev = useEvent();
  return (
    <AppShell
      title={ev.name}
      subtitle={ev.organization?.name}
      back="/dashboard"
      festivalType={ev.festivalType}
      wide
    >
      <EventGate>
        <Home />
      </EventGate>
    </AppShell>
  );
}

function Home() {
  const ev = useEvent();
  const { me } = useAuth();
  const canScan = can(ev.perms, "TOKEN_SCAN");
  const canIssue = can(ev.perms, "TOKEN_CREATE");
  const summary = useAsync(
    () => api.get<MySummary>(`/events/${ev.eventId}/my-summary`),
    [ev.eventId],
    canScan || canIssue,
  );
  const sponsors = useAsync(
    () => api.get<SponsorPublic[]>(`/events/${ev.eventId}/sponsors`),
    [ev.eventId],
  );
  const credit = useAsync(
    () => api.get<EventAllowance>(`/events/${ev.eventId}/credit-status`),
    [ev.eventId],
    canIssue,
  );
  const isAdmin = canAny(ev.perms, EVENT_ADMIN_PERMS);
  const orgId = ev.organization?.id;
  const orgAdmin =
    !!orgId &&
    (me?.isSuperAdmin ||
      canAny(
        me?.organizations.find((o) => o.id === orgId)?.permissions,
        ORG_ADMIN_PERMS,
      ));

  return (
    <div className="flex flex-col gap-4">
      <FestivalBanner
        type={ev.festivalType}
        title={ev.name}
        subtitle={
          ev.organization?.name && (
            <span className="inline-flex items-center gap-1.5">
              <Building2 aria-hidden className="h-4 w-4" />{" "}
              {ev.organization.name}
            </span>
          )
        }
        meta={
          <>
            {ev.startDate && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 font-medium backdrop-blur-sm">
                <CalendarDays aria-hidden className="h-4 w-4" />{" "}
                {fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}
              </span>
            )}
            {ev.status && <Badge value={ev.status} className="bg-white/95" />}
          </>
        }
      />

      {canIssue && <CreditBanner status={credit.data} orgId={orgId} />}
      {ev.status && ev.status !== "ACTIVE" && canScan && (
        <Alert kind="warning">
          Scanning works only while the festival is Active. It is currently{" "}
          {humanize(ev.status)}.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          {(canScan || canIssue) && (
            <div className="grid grid-cols-2 gap-3">
              {summary.loading ? (
                <>
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </>
              ) : summary.data ? (
                <>
                  <Stat
                    label="Today's visitors"
                    value={fmtNum(summary.data.today.visitors)}
                    tone="brand"
                    icon={Users}
                  />
                  <Stat
                    label="Entries today"
                    value={fmtNum(summary.data.today.entries)}
                    tone="green"
                    icon={CheckCircle2}
                  />
                </>
              ) : null}
            </div>
          )}
          {summary.error && (
            <Alert kind="warning">
              Could not load today&apos;s numbers. {summary.error}
            </Alert>
          )}

          {canScan && (
            <Link
              href={`/e/${ev.eventId}/scan`}
              className="group relative flex min-h-[132px] flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-green-500 to-teal-600 text-white shadow-xl shadow-green-600/30 active:scale-[0.99]"
            >
              <span
                aria-hidden
                className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10"
              />
              <span
                aria-hidden
                className="absolute -bottom-10 -left-4 h-24 w-24 rounded-full bg-white/10"
              />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
                <ScanLine aria-hidden className="h-8 w-8" />
              </span>
              <span className="relative text-2xl font-extrabold tracking-wide">
                SCAN QR TOKEN
              </span>
            </Link>
          )}
          {canIssue && (
            <Link
              href={`/e/${ev.eventId}/issue`}
              className="flex min-h-[84px] items-center justify-center gap-3 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-xl font-extrabold tracking-wide text-white shadow-lg shadow-orange-500/30 active:scale-[0.99]"
            >
              <Ticket aria-hidden className="h-7 w-7" />
              ISSUE TOKEN
            </Link>
          )}
          {canIssue && <IssueAllowance data={credit.data} />}
        </div>

        <div className="flex flex-col gap-4">
          {canScan && summary.data && (
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                    <Activity aria-hidden className="h-4 w-4" />
                  </span>
                  My activity today
                </h2>
                <Link
                  href={`/e/${ev.eventId}/my-scans`}
                  className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-orange-700"
                >
                  My scans <ChevronRight aria-hidden className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniStat
                  label="Scans"
                  value={summary.data.me.scans}
                  icon={ScanLine}
                  tone="bg-sky-50 text-sky-700"
                />
                <MiniStat
                  label="Allowed"
                  value={summary.data.me.successful}
                  icon={CheckCircle2}
                  tone="bg-emerald-50 text-green-700"
                />
                <MiniStat
                  label="Denied"
                  value={
                    summary.data.me.duplicate +
                    summary.data.me.expired +
                    summary.data.me.notYetValid +
                    summary.data.me.invalid +
                    summary.data.me.other
                  }
                  icon={ShieldX}
                  tone="bg-rose-50 text-red-700"
                />
              </div>
              {summary.data.me.lastActiveAt && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock aria-hidden className="h-3.5 w-3.5" /> Last scan:{" "}
                  {fmtDateTime(summary.data.me.lastActiveAt, ev.timezone)}
                </p>
              )}
            </Card>
          )}

          {!canScan && !canIssue && !isAdmin && (
            <Alert kind="info">You have no tasks for this festival yet.</Alert>
          )}

          <SponsorStrip sponsors={sponsors.data} compact />

          {(isAdmin || orgAdmin) && (
            <div className="flex flex-col gap-2">
              {isAdmin && (
                <Link href={`/e/${ev.eventId}/admin`} className={navLink}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 text-white">
                    <BarChart3 aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="flex-1">Festival dashboard</span>
                  <ChevronRight
                    aria-hidden
                    className="h-5 w-5 text-orange-400"
                  />
                </Link>
              )}
              {orgAdmin && orgId && (
                <Link href={`/org/${orgId}`} className={navLink}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
                    <Building2 aria-hidden className="h-5 w-5" />
                  </span>
                  <span className="flex-1">Mandal admin</span>
                  <ChevronRight
                    aria-hidden
                    className="h-5 w-5 text-orange-400"
                  />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const navLink =
  "flex min-h-[60px] items-center gap-3 rounded-2xl border border-orange-200 bg-white px-4 font-semibold shadow-sm hover:bg-orange-50";

function MiniStat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: typeof ScanLine;
}) {
  return (
    <div className={`rounded-xl p-2 ${tone}`}>
      <Icon aria-hidden className="mx-auto h-5 w-5 opacity-80" />
      <div className="text-2xl font-extrabold tabular-nums">
        {fmtNum(value)}
      </div>
      <div className="text-xs font-medium text-slate-600">{label}</div>
    </div>
  );
}
