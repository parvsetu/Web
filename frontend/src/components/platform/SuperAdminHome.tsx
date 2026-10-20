'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUpDown, BookOpen, Building2, CalendarClock, CalendarDays, ChevronRight, FilePen, Flame, History, Hourglass, MapPin,
  PartyPopper, Search, ShieldCheck, SlidersHorizontal, Sparkles, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useFestivalTypes } from '@/lib/catalog';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { fmtDate, fmtNum, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { usePagedList } from '@/lib/paged';
import type { MeUser, Organization } from '@/lib/types';
import { FestivalArt } from '@/components/FestivalArt';
import type { PendingCounts } from './PlatformAlertsBar';
import { Alert, Badge, Button, Empty, LabeledSelect, Modal, Pager, Skeleton, cx } from '@/components/ui';

interface DirectoryOverview {
  totals: { mandals: number; festivals: number; liveNow: number; upcoming: number; drafts: number; waitingReview: number };
  states: { state: string; mandals: number; festivals: number }[];
}

interface DirectoryEvent {
  id: string;
  name: string;
  festivalType: string;
  status: string;
  approvalStatus: string;
  startDate: string;
  endDate: string;
  city: string | null;
  state: string | null;
  organization: { id: string; name: string };
}

type View = 'festivals' | 'mandals';
type When = '' | 'live' | 'upcoming' | 'past';

interface Filters {
  view: View;
  when: When;
  state: string;
  city: string;
  festivalType: string;
  status: string;
  approvalStatus: string;
  sort: string;
}

const EMPTY: Filters = { view: 'festivals', when: '', state: '', city: '', festivalType: '', status: '', approvalStatus: '', sort: '' };
const KEYS = Object.keys(EMPTY) as (keyof Filters)[];

const WHEN_CHIPS: { key: When; label: string; icon: typeof Flame }[] = [
  { key: '', label: 'All', icon: Sparkles },
  { key: 'live', label: 'Live now', icon: Flame },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock },
  { key: 'past', label: 'Past', icon: History },
];

const APPROVAL_LABEL: Record<string, string> = {
  DRAFT: 'Not submitted', SUBMITTED: 'Waiting for review', CHANGES_REQUESTED: 'Changes requested',
  APPROVED_AWAITING_PAYMENT: 'Approved, fee unpaid', LIVE: 'Live', REJECTED: 'Rejected',
};

/** Filters live in the URL so a filtered view survives back/refresh and can be shared with another admin. */
function readUrl(): Filters {
  if (typeof window === 'undefined') return EMPTY;
  const p = new URLSearchParams(window.location.search);
  const f = { ...EMPTY };
  for (const k of KEYS) {
    const v = p.get(k);
    if (v) (f as Record<string, string>)[k] = v;
  }
  if (f.view !== 'mandals') f.view = 'festivals';
  return f;
}

function writeUrl(f: Filters) {
  const p = new URLSearchParams();
  for (const k of KEYS) if (f[k] && f[k] !== EMPTY[k]) p.set(k, f[k]);
  const qs = p.toString();
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
  } catch {
    /* ignore */
  }
}

/**
 * Super admin home: a searchable, filterable directory of every festival and
 * mandal instead of one long list — stays usable with thousands of rows across
 * states and cities. All filtering happens on the server, 20 rows a page.
 */
export function SuperAdminHome({ me }: { me: MeUser }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [ready, setReady] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    setF(readUrl());
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) writeUrl(f);
  }, [f, ready]);
  const set = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));

  const overview = useAsync(() => api.get<DirectoryOverview>('/platform/directory/overview'), []);
  const pending = useAsync(() => api.get<PendingCounts>('/platform/pending'), []);
  const types = useFestivalTypes();
  const typeLabel = (k: string) => types.data?.find((t) => t.key === k)?.label ?? humanize(k);

  const festivals = usePagedList<DirectoryEvent>(
    '/platform/directory/events',
    { when: f.when || undefined, state: f.state || undefined, city: f.city || undefined, festivalType: f.festivalType || undefined, status: f.status || undefined, approvalStatus: f.approvalStatus || undefined, sort: f.sort || undefined },
    { pageSize: 20, enabled: ready && f.view === 'festivals' },
  );
  const mandals = usePagedList<Organization & { _count?: { events: number } }>(
    '/organizations',
    { state: f.state || undefined, city: f.city || undefined },
    { pageSize: 20, enabled: ready && f.view === 'mandals' },
  );
  const list = f.view === 'festivals' ? festivals : mandals;

  // One search box for both views.
  const [search, setSearch] = useState('');
  useEffect(() => {
    festivals.setSearch(search);
    mandals.setSearch(search);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = overview.data?.totals;
  const waiting = pending.data?.total ?? 0;
  const first = me.name.split(/\s+/)[0] || me.name;

  const active: { key: keyof Filters; label: string }[] = [];
  if (f.state) active.push({ key: 'state', label: f.state });
  if (f.city) active.push({ key: 'city', label: f.city });
  if (f.view === 'festivals') {
    if (f.festivalType) active.push({ key: 'festivalType', label: typeLabel(f.festivalType) });
    if (f.status) active.push({ key: 'status', label: humanize(f.status) });
    if (f.approvalStatus) active.push({ key: 'approvalStatus', label: APPROVAL_LABEL[f.approvalStatus] ?? humanize(f.approvalStatus) });
  }
  const sheetCount = active.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-4 text-white shadow-xl shadow-fuchsia-500/20 sm:p-6">
        <span aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-sm" />
        <span aria-hidden className="absolute -bottom-16 left-1/4 h-36 w-36 rounded-full bg-amber-300/20 blur-md" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/80">Super admin</p>
            <h1 className="text-xl font-black tracking-tight sm:text-3xl">Hey {first} 👋</h1>
            <p className="mt-1 text-sm text-white/85">
              {t ? `${fmtNum(t.mandals)} mandals · ${fmtNum(t.festivals)} festivals across ${overview.data?.states.length ?? 0} states` : 'Loading the platform…'}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/platform" className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white px-3 text-sm font-bold text-fuchsia-700 shadow-md active:scale-[0.98] sm:px-4">
              <ShieldCheck aria-hidden className="h-4 w-4" /> <span className="hidden sm:inline">Platform admin</span><span className="sm:hidden">Admin</span>
              {waiting > 0 && <span className="rounded-full bg-rose-600 px-2 text-xs leading-5 text-white">{waiting > 99 ? '99+' : waiting}</span>}
            </Link>
            <Link href="/guide" aria-label="My role" className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl bg-white/15 px-3 text-sm sm:px-4 font-bold text-white ring-1 ring-white/40 hover:bg-white/25">
              <BookOpen aria-hidden className="h-4 w-4" /> <span className="hidden sm:inline">My role</span>
            </Link>
          </div>
        </div>

        {/* Stat tiles double as quick filters */}
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile icon={Flame} label="Live now" value={t?.liveNow} on={f.view === 'festivals' && f.when === 'live'} onClick={() => set({ view: 'festivals', when: f.when === 'live' ? '' : 'live' })} />
          <StatTile icon={CalendarClock} label="Upcoming" value={t?.upcoming} on={f.view === 'festivals' && f.when === 'upcoming'} onClick={() => set({ view: 'festivals', when: f.when === 'upcoming' ? '' : 'upcoming' })} />
          <StatTile icon={Hourglass} label="Waiting review" value={t?.waitingReview} on={f.approvalStatus === 'SUBMITTED'} onClick={() => set({ view: 'festivals', approvalStatus: f.approvalStatus === 'SUBMITTED' ? '' : 'SUBMITTED' })} />
          <StatTile icon={FilePen} label="Drafts" value={t?.drafts} on={f.status === 'DRAFT'} onClick={() => set({ view: 'festivals', status: f.status === 'DRAFT' ? '' : 'DRAFT' })} />
        </div>
      </section>

      {/* Sticky search + view switch */}
      <div className="no-print sticky top-[57px] z-20 -mx-4 flex flex-col gap-3 bg-[#fffaf3]/95 px-4 py-2 backdrop-blur">
        <div className="flex gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Search</span>
            <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-fuchsia-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={f.view === 'festivals' ? 'Search festival, mandal or city' : 'Search mandal name or city'}
              className="min-h-[52px] w-full rounded-2xl border-0 bg-white pl-12 pr-10 text-base shadow-sm ring-1 ring-fuchsia-100 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-fuchsia-300/50"
            />
            {search && (
              <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:text-slate-700">
                <X aria-hidden className="h-4 w-4" />
              </button>
            )}
          </label>
          <button
            type="button"
            onClick={() => setSheet(true)}
            className="relative inline-flex min-h-[52px] shrink-0 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white shadow-sm active:scale-[0.98]"
          >
            <SlidersHorizontal aria-hidden className="h-5 w-5" />
            <span className="hidden sm:inline">Filters</span>
            {sheetCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-fuchsia-500 px-1 text-xs">{sheetCount}</span>}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Show" className="inline-flex rounded-2xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
            {(['festivals', 'mandals'] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={f.view === v}
                onClick={() => set({ view: v })}
                className={cx('inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold transition-all', f.view === v ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow' : 'text-slate-600 hover:text-slate-900')}
              >
                {v === 'festivals' ? <PartyPopper aria-hidden className="h-4 w-4" /> : <Building2 aria-hidden className="h-4 w-4" />}
                {v === 'festivals' ? 'Festivals' : 'Mandals'}
                {t && <span className={cx('text-xs font-semibold', f.view === v ? 'text-white/80' : 'text-slate-400')}>{fmtNum(v === 'festivals' ? t.festivals : t.mandals)}</span>}
              </button>
            ))}
          </div>
          {f.view === 'festivals' && (
            <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-0.5">
              {WHEN_CHIPS.map((c) => (
                <Chip key={c.key || 'all'} on={f.when === c.key} onClick={() => set({ when: c.key })}>
                  <c.icon aria-hidden className="h-3.5 w-3.5" /> {c.label}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {/* Top states as one-tap filters */}
        {(overview.data?.states.length ?? 0) > 1 && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {overview.data!.states.slice(0, 10).map((s) => (
              <Chip key={s.state} tone="soft" on={f.state === s.state} onClick={() => set({ state: f.state === s.state ? '' : s.state, city: '' })}>
                <MapPin aria-hidden className="h-3.5 w-3.5" /> {s.state}
                <span className="opacity-60">{f.view === 'festivals' ? s.festivals : s.mandals}</span>
              </Chip>
            ))}
          </div>
        )}

        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {active.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => set(a.key === 'state' ? { state: '', city: '' } : { [a.key]: '' })}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-fuchsia-100 px-3 text-xs font-bold text-fuchsia-800 hover:bg-fuchsia-200"
              >
                {a.label} <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            ))}
            <button type="button" onClick={() => setF({ ...EMPTY, view: f.view })} className="min-h-[32px] px-2 text-xs font-bold text-slate-500 underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{list.loading && !list.data ? 'Searching…' : `${fmtNum(list.total)} ${f.view === 'festivals' ? (list.total === 1 ? 'festival' : 'festivals') : list.total === 1 ? 'mandal' : 'mandals'}`}</span>
        {f.view === 'festivals' && (
          <label className="inline-flex items-center gap-1.5">
            <ArrowUpDown aria-hidden className="h-4 w-4" />
            <span className="sr-only">Sort</span>
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="min-h-[36px] rounded-xl border-0 bg-transparent pr-6 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-fuchsia-300">
              <option value="">Newest dates first</option>
              <option value="soonest">Oldest dates first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        )}
      </div>

      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[76px] rounded-2xl" />)}
        </div>
      ) : list.items.length === 0 ? (
        <Empty icon={Search} title={f.view === 'festivals' ? 'No festivals match' : 'No mandals match'}>
          Try another search, or clear some filters.
        </Empty>
      ) : f.view === 'festivals' ? (
        <ul className="flex flex-col gap-2">
          {festivals.items.map((ev) => <FestivalRow key={ev.id} ev={ev} typeLabel={typeLabel(ev.festivalType)} />)}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {mandals.items.map((o) => <MandalRow key={o.id} org={o} />)}
        </ul>
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={(p) => { list.setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />

      <FilterSheet open={sheet} onClose={() => setSheet(false)} f={f} onApply={(patch) => { set(patch); setSheet(false); }} states={overview.data?.states ?? []} />
    </div>
  );
}

function StatTile({ icon: Icon, label, value, on, onClick }: { icon: typeof Flame; label: string; value: number | undefined; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'flex min-h-[60px] flex-col items-start justify-between gap-1 rounded-2xl p-2.5 text-left sm:min-h-[72px] sm:p-3 transition-all active:scale-[0.98]',
        on ? 'bg-white text-fuchsia-700 shadow-lg' : 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25',
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide opacity-90">
        <Icon aria-hidden className="h-3.5 w-3.5" /> {label}
      </span>
      <span className="text-xl font-black leading-none sm:text-2xl">{value === undefined ? '–' : fmtNum(value)}</span>
    </button>
  );
}

function Chip({ on, onClick, children, tone = 'solid' }: { on: boolean; onClick: () => void; children: ReactNode; tone?: 'solid' | 'soft' }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-all',
        on
          ? tone === 'solid' ? 'bg-slate-900 text-white' : 'bg-fuchsia-600 text-white'
          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-fuchsia-300',
      )}
    >
      {children}
    </button>
  );
}

function FestivalRow({ ev, typeLabel }: { ev: DirectoryEvent; typeLabel: string }) {
  const theme = festivalTheme(ev.festivalType);
  const place = [ev.city, ev.state].filter(Boolean).join(', ');
  return (
    <li>
      <div className="group flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-2 shadow-sm ring-1 ring-slate-100 transition-all hover:shadow-md hover:ring-fuchsia-200">
        <Link href={`/e/${ev.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: gradient(theme) }}>
            <span className="h-10 w-10 rounded-full bg-white/95 p-1">
              <FestivalArt type={ev.festivalType} className="h-full w-full" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate font-extrabold text-slate-900">{ev.name}</span>
            </span>
            <span className="block truncate text-xs text-slate-500">
              <span className="font-semibold" style={{ color: theme.ink }}>{typeLabel}</span> · {ev.organization.name}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><CalendarDays aria-hidden className="h-3.5 w-3.5" />{fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}</span>
              {place && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5" />{place}</span>}
            </span>
          </span>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge value={ev.status} />
          {ev.approvalStatus !== 'LIVE' && ev.approvalStatus !== 'DRAFT' && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">{APPROVAL_LABEL[ev.approvalStatus] ?? humanize(ev.approvalStatus)}</span>
          )}
          <Link href={`/e/${ev.id}/admin`} className="hidden items-center gap-0.5 text-xs font-bold text-fuchsia-700 hover:underline sm:inline-flex">
            Dashboard <ChevronRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function MandalRow({ org }: { org: Organization & { _count?: { events: number } } }) {
  const place = [org.city, org.state].filter(Boolean).join(', ');
  const initials = org.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <li>
      <div className="flex items-center gap-3 rounded-2xl bg-white p-2.5 pr-2 shadow-sm ring-1 ring-slate-100 hover:shadow-md hover:ring-fuchsia-200">
        <Link href={`/org/${org.id}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-black text-white">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-extrabold text-slate-900">{org.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
              {place && <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="h-3.5 w-3.5" />{place}</span>}
              {org._count && <span>{org._count.events} {org._count.events === 1 ? 'festival' : 'festivals'}</span>}
              {org.agent && <span className="text-emerald-700">Agent {org.agent.code}</span>}
            </span>
          </span>
        </Link>
        <Link href={`/org/${org.id}`} className="inline-flex min-h-[40px] shrink-0 items-center rounded-xl bg-slate-900 px-3 text-sm font-bold text-white">
          Manage
        </Link>
      </div>
    </li>
  );
}

function FilterSheet({ open, onClose, f, onApply, states }: { open: boolean; onClose: () => void; f: Filters; onApply: (p: Partial<Filters>) => void; states: DirectoryOverview['states'] }) {
  const [d, setD] = useState(f);
  useEffect(() => {
    if (open) setD(f);
  }, [open, f]);
  const cities = useAsync(() => api.get<{ city: string; count: number }[]>('/platform/directory/cities', { state: d.state || undefined }), [d.state], open);
  const types = useFestivalTypes();
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; label: string }[]>();
    for (const t of types.data ?? []) m.set(t.group, [...(m.get(t.group) ?? []), { key: t.key, label: t.label }]);
    return [...m.entries()];
  }, [types.data]);
  const festivals = f.view === 'festivals';

  return (
    <Modal open={open} onClose={onClose} title="Filters">
      <div className="flex flex-col gap-4">
        <LabeledSelect label="State" value={d.state} onChange={(e) => setD({ ...d, state: e.target.value, city: '' })}>
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s.state} value={s.state}>{s.state} ({festivals ? s.festivals : s.mandals})</option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="City" value={d.city} onChange={(e) => setD({ ...d, city: e.target.value })}>
          <option value="">{d.state ? `All cities in ${d.state}` : 'All cities'}</option>
          {(cities.data ?? []).map((c) => (
            <option key={c.city} value={c.city}>{c.city} ({c.count})</option>
          ))}
        </LabeledSelect>
        {festivals && (
          <>
            <LabeledSelect label="Festival type" value={d.festivalType} onChange={(e) => setD({ ...d, festivalType: e.target.value })}>
              <option value="">All types</option>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={humanize(g)}>
                  {list.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </optgroup>
              ))}
            </LabeledSelect>
            <LabeledSelect label="Status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>
              <option value="">Any status</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </LabeledSelect>
            <LabeledSelect label="Platform review" value={d.approvalStatus} onChange={(e) => setD({ ...d, approvalStatus: e.target.value })}>
              <option value="">Any</option>
              {Object.entries(APPROVAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </LabeledSelect>
          </>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setD({ ...EMPTY, view: f.view, when: f.when, sort: f.sort })}>Reset</Button>
          <Button className="flex-1" onClick={() => onApply({ state: d.state, city: d.city, festivalType: d.festivalType, status: d.status, approvalStatus: d.approvalStatus })}>Show results</Button>
        </div>
      </div>
    </Modal>
  );
}
