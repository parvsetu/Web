'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEvent } from '@/lib/event-context';
import { can, canAny } from '@/lib/permissions';
import type { Permission } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { BarChart3, Camera, Clock, Globe, Megaphone, FileBarChart, HandCoins, LayoutDashboard, ReceiptIndianRupee, ScanLine, Settings, Ticket, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import { FestivalBanner } from '@/components/FestivalBanner';
import { Alert, Badge, SideTabsLayout } from '@/components/ui';
import { OverviewTab } from '@/components/admin/OverviewTab';
import { TokensTab } from '@/components/admin/TokensTab';
import { SlotsTab } from '@/components/admin/SlotsTab';
import { VolunteersTab } from '@/components/admin/VolunteersTab';
import { ScansTab } from '@/components/admin/ScansTab';
import { ReportsTab } from '@/components/admin/ReportsTab';
import { DonationsTab } from '@/components/admin/DonationsTab';
import { PassOrdersTab } from '@/components/admin/PassOrdersTab';
import { PromoteTab } from '@/components/admin/PromoteTab';
import { ExpensesTab } from '@/components/admin/ExpensesTab';
import { EventSettingsTab } from '@/components/admin/EventSettingsTab';
import { PhotosTab } from '@/components/admin/PhotosTab';
import { EventApprovalCard } from '@/components/admin/EventApprovalCard';

const TABS: { key: string; label: string; icon: LucideIcon; anyOf: Permission[] }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard, anyOf: ['REPORT_VIEW'] },
  { key: 'tokens', label: 'Tokens', icon: Ticket, anyOf: ['TOKEN_VIEW', 'TOKEN_GENERATE'] },
  { key: 'slots', label: 'Time slots', icon: Clock, anyOf: ['SETTINGS_UPDATE'] },
  { key: 'volunteers', label: 'Volunteers', icon: Users, anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'scans', label: 'Scans', icon: ScanLine, anyOf: ['REPORT_VIEW'] },
  { key: 'reports', label: 'Reports', icon: FileBarChart, anyOf: ['REPORT_VIEW'] },
  { key: 'photos', label: 'Photos', icon: Camera, anyOf: ['GALLERY_VIEW'] },
  { key: 'promote', label: 'Promote', icon: Megaphone, anyOf: ['EVENT_UPDATE'] },
  { key: 'passes', label: 'Online passes', icon: Globe, anyOf: ['DONATION_VIEW'] },
  { key: 'donations', label: 'Donations', icon: HandCoins, anyOf: ['DONATION_VIEW'] },
  { key: 'expenses', label: 'Expenses', icon: ReceiptIndianRupee, anyOf: ['EXPENSE_VIEW'] },
  { key: 'settings', label: 'Settings', icon: Settings, anyOf: ['EVENT_UPDATE'] },
];

export default function EventAdminPage() {
  const ev = useEvent();
  return (
    <AppShell title={ev.name} subtitle="Festival dashboard" back={`/e/${ev.eventId}`} wide festivalType={ev.festivalType}>
      <EventGate>
        <Admin />
      </EventGate>
    </AppShell>
  );
}

function Admin() {
  const ev = useEvent();
  const visible = useMemo(() => TABS.filter((t) => canAny(ev.perms, t.anyOf)), [ev.perms]);
  const [tab, setTab] = useState<string>('');

  useEffect(() => {
    const fromHash = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    setTab((cur) => {
      if (cur && visible.some((t) => t.key === cur)) return cur;
      if (visible.some((t) => t.key === fromHash)) return fromHash;
      return visible[0]?.key ?? '';
    });
  }, [visible]);

  function change(k: string) {
    setTab(k);
    try {
      window.history.replaceState(null, '', `#${k}`);
    } catch {
      /* ignore */
    }
  }

  if (visible.length === 0) return <Alert kind="warning">You do not have access to any management pages for this festival.</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print">
        <FestivalBanner
          compact
          type={ev.festivalType}
          title={ev.name}
          subtitle={
            <span className="inline-flex items-center gap-1.5">
              <BarChart3 aria-hidden className="h-4 w-4" /> Festival dashboard{ev.organization?.name ? ` · ${ev.organization.name}` : ''}
            </span>
          }
          meta={
            <>
              {ev.startDate && <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">{fmtDate(ev.startDate)} – {fmtDate(ev.endDate)}</span>}
              {ev.status && <Badge value={ev.status} className="bg-white/95" />}
            </>
          }
        />
      </div>
      <EventApprovalCard />
      <SideTabsLayout tabs={visible} active={tab} onChange={change}>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'tokens' && <TokensTab />}
      {tab === 'slots' && <SlotsTab />}
      {tab === 'volunteers' && <VolunteersTab />}
      {tab === 'scans' && <ScansTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'photos' && <PhotosTab />}
      {tab === 'promote' && <PromoteTab />}
      {tab === 'passes' && <PassOrdersTab />}
      {tab === 'donations' && <DonationsTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'settings' && (can(ev.perms, 'EVENT_UPDATE') ? <EventSettingsTab /> : null)}
      </SideTabsLayout>
    </div>
  );
}
