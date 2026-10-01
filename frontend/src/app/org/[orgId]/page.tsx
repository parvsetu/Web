'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '@/lib/org-context';
import { canAny } from '@/lib/permissions';
import type { Permission } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { Building2, Camera, CreditCard, Globe, FileBarChart, Handshake, History, KeyRound, Landmark, PartyPopper, Settings, UserCheck, UserCog, Users, Wallet } from 'lucide-react';
import { AccountsTab } from '@/components/org/AccountsTab';
import { SponsorsTab } from '@/components/org/SponsorsTab';
import { CreditTab } from '@/components/org/CreditTab';
import { PayoutsTab } from '@/components/org/PayoutsTab';
import type { LucideIcon } from 'lucide-react';
import { Mandala, Toran } from '@/components/FestivalArt';
import { Alert, SkeletonList, SideTabsLayout } from '@/components/ui';
import { OrgEventsTab } from '@/components/org/OrgEventsTab';
import { OrgVolunteersTab } from '@/components/org/OrgVolunteersTab';
import { ApplicationsTab } from '@/components/org/ApplicationsTab';
import { MembersTab } from '@/components/org/MembersTab';
import { RolesTab } from '@/components/org/RolesTab';
import { AuditTab } from '@/components/org/AuditTab';
import { OrgReportsTab } from '@/components/org/OrgReportsTab';
import { OrgSettingsTab } from '@/components/org/OrgSettingsTab';
import { GalleryTab } from '@/components/org/GalleryTab';
import { LandingTab } from '@/components/org/LandingTab';
import { apiImageSrc } from '@/lib/images';

const TABS: { key: string; label: string; icon: LucideIcon; anyOf: Permission[] }[] = [
  { key: 'events', label: 'Festivals', icon: PartyPopper, anyOf: ['EVENT_VIEW'] },
  { key: 'volunteers', label: 'Volunteers', icon: Users, anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'applications', label: 'Applications', icon: UserCheck, anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'members', label: 'Members', icon: UserCog, anyOf: ['USER_VIEW'] },
  { key: 'roles', label: 'Roles', icon: KeyRound, anyOf: ['ROLE_VIEW'] },
  { key: 'accounts', label: 'Accounts & P/L', icon: Wallet, anyOf: ['EXPENSE_VIEW'] },
  { key: 'sponsors', label: 'Sponsors', icon: Handshake, anyOf: ['EVENT_VIEW'] },
  { key: 'gallery', label: 'Gallery', icon: Camera, anyOf: ['GALLERY_VIEW'] },
  { key: 'landing', label: 'Landing page', icon: Globe, anyOf: ['SETTINGS_VIEW'] },
  { key: 'credit', label: 'Pass credit', icon: CreditCard, anyOf: ['SETTINGS_VIEW'] },
  { key: 'payouts', label: 'Payouts & bank', icon: Landmark, anyOf: ['SETTINGS_VIEW'] },
  { key: 'audit', label: 'Audit log', icon: History, anyOf: ['AUDIT_VIEW'] },
  { key: 'reports', label: 'Reports', icon: FileBarChart, anyOf: ['REPORT_VIEW'] },
  { key: 'settings', label: 'Settings', icon: Settings, anyOf: ['SETTINGS_UPDATE'] },
];

export default function OrgAdminPage() {
  const org = useOrg();
  return (
    <AppShell title={org.name} subtitle="Mandal admin" back="/" wide>
      <OrgAdmin />
    </AppShell>
  );
}

function OrgAdmin() {
  const org = useOrg();
  const visible = useMemo(() => TABS.filter((t) => canAny(org.perms, t.anyOf)), [org.perms]);
  const [tab, setTab] = useState('');

  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    setTab((cur) => (cur && visible.some((t) => t.key === cur) ? cur : visible.some((t) => t.key === h) ? h : visible[0]?.key ?? ''));
  }, [visible]);

  function change(k: string) {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {
      /* ignore */
    }
  }

  const logoSrc = apiImageSrc(org.org?.logoUrl);
  const bannerSrc = apiImageSrc(org.org?.bannerUrl);

  if (org.loading) return <SkeletonList />;
  if (visible.length === 0) return <Alert kind="warning">You do not have admin access to this mandal.</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <section className="no-print relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-white shadow-lg">
        {bannerSrc && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bannerSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
          </>
        )}
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 text-white/15" />
        <div className="relative flex items-center gap-3 px-5 pb-5 pt-8">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 ring-2 ring-white/40">
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="" className="h-full w-full bg-white object-contain p-1" />
            ) : (
              <Building2 aria-hidden className="h-7 w-7" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Mandal admin</p>
            <h1 className="truncate text-2xl font-extrabold">{org.name}</h1>
          </div>
        </div>
      </section>
      <SideTabsLayout tabs={visible} active={tab} onChange={change}>
      {tab === 'events' && <OrgEventsTab />}
      {tab === 'volunteers' && <OrgVolunteersTab />}
      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'sponsors' && <SponsorsTab />}
      {tab === 'gallery' && <GalleryTab />}
      {tab === 'landing' && <LandingTab />}
      {tab === 'credit' && <CreditTab />}
      {tab === 'payouts' && <PayoutsTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'reports' && <OrgReportsTab />}
      {tab === 'settings' && <OrgSettingsTab />}
      </SideTabsLayout>
    </div>
  );
}
