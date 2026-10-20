'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Building2, CheckCircle2, ChevronDown, ExternalLink, Lock, PartyPopper, ShieldCheck, Target } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { Alert, Card, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  AREA_TITLE, CAPABILITIES, ROLE_PROFILES, SUPER_ADMIN_PROFILE, allowed, capabilityHref, profileFor,
  type Capability, type GuideArea, type GuideContext, type RoleProfile,
} from '@/lib/role-guide';
import type { MeUser } from '@/lib/types';

/** One "hat" the signed-in person wears: super admin, a mandal role, or a festival assignment. */
interface Hat {
  id: string;
  label: string;
  where: string;
  profile: RoleProfile;
  perms: string[];
  superAdmin: boolean;
  ctx: GuideContext;
  areas: GuideArea[];
  icon: typeof ShieldCheck;
}

const ALL_PERMS = Array.from(new Set(CAPABILITIES.flatMap((c) => c.anyOf)));

/** Seeded permissions per system role, so "See other roles" can preview them. Mirrors backend SYSTEM_ROLES. */
const SYSTEM_ROLE_PERMS: Record<string, string[]> = {
  MANDAL_ADMIN: ALL_PERMS,
  TREASURER: ['EVENT_VIEW', 'DONATION_VIEW', 'DONATION_CREATE', 'DONATION_UPDATE', 'DONATION_TAX_VIEW', 'DONATION_TAX_MANAGE', 'EXPENSE_VIEW', 'EXPENSE_CREATE', 'EXPENSE_UPDATE', 'REPORT_VIEW', 'REPORT_EXPORT', 'GALLERY_VIEW', 'STALL_VIEW'],
  GATE_SUPERVISOR: ['EVENT_VIEW', 'TOKEN_SCAN', 'TOKEN_VIEW', 'TOKEN_MANUAL_ENTRY', 'REPORT_VIEW'],
  TOKEN_ISSUER: ['EVENT_VIEW', 'TOKEN_VIEW', 'TOKEN_CREATE', 'TOKEN_SCAN'],
  VOLUNTEER: ['EVENT_VIEW', 'TOKEN_SCAN'],
  REPORT_VIEWER: ['EVENT_VIEW', 'TOKEN_VIEW', 'VOLUNTEER_VIEW', 'REPORT_VIEW', 'REPORT_EXPORT', 'DONATION_VIEW', 'DONATION_TAX_VIEW', 'EXPENSE_VIEW', 'GALLERY_VIEW', 'REVIEW_VIEW', 'STALL_VIEW'],
};

function hatsFor(me: MeUser): Hat[] {
  const hats: Hat[] = [];
  if (me.isSuperAdmin) {
    hats.push({
      id: 'super', label: 'Super Admin', where: 'Whole platform', profile: SUPER_ADMIN_PROFILE, perms: ALL_PERMS, superAdmin: true,
      ctx: {}, areas: ['platform', 'mandal', 'festival', 'gate'], icon: ShieldCheck,
    });
    return hats;
  }
  for (const o of me.organizations) {
    if (!o.role) continue;
    const firstEvent = me.events.find((e) => e.organization.id === o.id);
    hats.push({
      id: `org-${o.id}`, label: o.role.key === 'TREASURER' ? 'Treasurer / Accountant' : o.role.name, where: o.name, profile: profileFor(o.role.key, o.role.name),
      perms: o.permissions, superAdmin: false, ctx: { orgId: o.id, eventId: firstEvent?.id }, areas: ['mandal', 'festival', 'gate'], icon: Building2,
    });
  }
  for (const e of me.events) {
    if (!e.assignmentRole) continue;
    hats.push({
      id: `ev-${e.id}`, label: e.assignmentRole.name, where: e.name, profile: profileFor(e.assignmentRole.key, e.assignmentRole.name),
      perms: e.permissions, superAdmin: false, ctx: { eventId: e.id }, areas: ['festival', 'gate'], icon: PartyPopper,
    });
  }
  return hats;
}

export default function GuidePage() {
  const { me } = useAuth();
  return (
    <AppShell title="My role & how-to" subtitle="What you can do in Parvsetu" back="/dashboard">
      {me && <Guide me={me} />}
    </AppShell>
  );
}

function Guide({ me }: { me: MeUser }) {
  const hats = useMemo(() => hatsFor(me), [me]);
  const [hatId, setHatId] = useState('');
  const [preview, setPreview] = useState('');
  useEffect(() => setHatId((cur) => cur || hats[0]?.id || ''), [hats]);

  const previewHat: Hat | null = preview
    ? (() => {
        const p = ROLE_PROFILES.find((r) => r.key === preview)!;
        return { id: `preview-${p.key}`, label: p.name, where: 'Preview', profile: p, perms: SYSTEM_ROLE_PERMS[p.key] ?? [], superAdmin: false, ctx: {}, areas: ['mandal', 'festival', 'gate'], icon: BookOpen };
      })()
    : null;
  const hat = previewHat ?? hats.find((h) => h.id === hatId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {hats.length === 0 && !preview && (
        <Alert kind="info">You don’t have a role in any mandal yet. Ask your Mandal Admin to add you, or look at what each role does below.</Alert>
      )}

      {hats.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-600">You have more than one role. Pick one:</p>
          <div className="flex flex-wrap gap-2">
            {hats.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => { setHatId(h.id); setPreview(''); }}
                className={cx(
                  'inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-left text-sm font-semibold transition-all',
                  !preview && hatId === h.id ? 'bg-slate-900 text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-orange-300',
                )}
              >
                <h.icon aria-hidden className="h-4 w-4 shrink-0" />
                <span>{h.label} <span className="font-normal opacity-70">· {h.where}</span></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hat && <HatView hat={hat} isPreview={!!previewHat} onExitPreview={() => setPreview('')} />}

      <Card>
        <h2 className="flex items-center gap-2 text-base font-bold"><BookOpen aria-hidden className="h-5 w-5 text-sky-500" /> What other roles do</h2>
        <p className="mt-1 text-sm text-slate-600">Useful when you choose a role for a new member. Tap one to preview its jobs.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLE_PROFILES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => { setPreview(preview === r.key ? '' : r.key); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              className={cx('min-h-[40px] rounded-full px-3 text-sm font-semibold', preview === r.key ? 'bg-sky-600 text-white' : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100')}
            >
              {r.name}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Mandals can also create custom roles with exactly the permissions they want (Mandal admin → Roles). More questions? See <Link href="/faq" className="font-semibold text-orange-700 underline">Help &amp; FAQ</Link>.</p>
      </Card>
    </div>
  );
}

function HatView({ hat, isPreview, onExitPreview }: { hat: Hat; isPreview: boolean; onExitPreview: () => void }) {
  const relevant = CAPABILITIES.filter((c) => hat.areas.includes(c.area) && (c.area !== 'platform' || hat.superAdmin));
  const can = relevant.filter((c) => allowed(c, hat.perms, hat.superAdmin));
  const cannot = relevant.filter((c) => !allowed(c, hat.perms, hat.superAdmin) && c.area !== 'platform');
  const byArea = hat.areas.map((a) => ({ area: a, items: can.filter((c) => c.area === a) })).filter((g) => g.items.length > 0);

  return (
    <>
      <section className={cx('relative overflow-hidden rounded-3xl p-5 text-white shadow-lg', hat.superAdmin ? 'bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500' : isPreview ? 'bg-gradient-to-br from-sky-500 to-indigo-600' : 'bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500')}>
        <span aria-hidden className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
        <p className="relative text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{isPreview ? 'Previewing role' : 'Your role'}</p>
        <h1 className="relative text-2xl font-black">{hat.profile.key === 'CUSTOM' ? hat.label : hat.profile.name}</h1>
        <p className="relative text-sm text-white/85">{hat.where}</p>
        <p className="relative mt-3 text-sm leading-relaxed">{hat.profile.summary}</p>
        {isPreview && (
          <button type="button" onClick={onExitPreview} className="relative mt-3 min-h-[40px] rounded-xl bg-white/20 px-3 text-sm font-semibold ring-1 ring-white/40 hover:bg-white/30">
            Back to my role
          </button>
        )}
      </section>

      <Card>
        <h2 className="flex items-center gap-2 text-base font-bold"><Target aria-hidden className="h-5 w-5 text-orange-500" /> Your responsibilities</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {hat.profile.responsibilities.map((r) => (
            <li key={r} className="flex gap-2 text-sm text-slate-700">
              <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> <span>{r}</span>
            </li>
          ))}
        </ul>
      </Card>

      {byArea.map((g) => (
        <section key={g.area} className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-bold uppercase tracking-wider text-slate-500">{AREA_TITLE[g.area]} · {g.items.length}</h2>
          {g.items.map((c) => <CapabilityCard key={c.id} c={c} href={isPreview ? null : capabilityHref(c, hat.ctx)} />)}
        </section>
      ))}

      {cannot.length > 0 && (
        <details className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-700">
            <Lock aria-hidden className="h-4 w-4" /> Not part of this role ({cannot.length})
            <ChevronDown aria-hidden className="ml-auto h-4 w-4" />
          </summary>
          <p className="mt-2 text-sm text-slate-600">{hat.superAdmin ? '' : 'If you need one of these, ask your Mandal Admin to change your role.'}</p>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-500 sm:grid-cols-2">
            {cannot.map((c) => <li key={c.id}>• {c.title}</li>)}
          </ul>
        </details>
      )}
    </>
  );
}

function CapabilityCard({ c, href }: { c: Capability; href: string | null }) {
  return (
    <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-orange-100 open:ring-orange-300">
      <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900">{c.title}</span>
          <span className="block text-sm text-slate-500">{c.what}</span>
        </span>
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-orange-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-orange-50 px-4 pb-4 pt-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">How</p>
        <ol className="mt-2 flex flex-col gap-1.5">
          {c.steps.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-slate-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        {href && (
          <Link href={href} className="mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
            Take me there <ExternalLink aria-hidden className="h-4 w-4" />
          </Link>
        )}
      </div>
    </details>
  );
}
