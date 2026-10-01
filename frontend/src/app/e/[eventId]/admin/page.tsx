'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEvent } from '@/lib/event-context';
import { can, canAny } from '@/lib/permissions';
import type { Permission } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { Alert, Tabs } from '@/components/ui';
import { OverviewTab } from '@/components/admin/OverviewTab';
import { TokensTab } from '@/components/admin/TokensTab';
import { SlotsTab } from '@/components/admin/SlotsTab';
import { VolunteersTab } from '@/components/admin/VolunteersTab';
import { ScansTab } from '@/components/admin/ScansTab';
import { ReportsTab } from '@/components/admin/ReportsTab';
import { DonationsTab } from '@/components/admin/DonationsTab';
import { ExpensesTab } from '@/components/admin/ExpensesTab';
import { EventSettingsTab } from '@/components/admin/EventSettingsTab';

const TABS: { key: string; label: string; anyOf: Permission[] }[] = [
  { key: 'overview', label: 'Overview', anyOf: ['REPORT_VIEW'] },
  { key: 'tokens', label: 'Tokens', anyOf: ['TOKEN_VIEW', 'TOKEN_GENERATE'] },
  { key: 'slots', label: 'Time slots', anyOf: ['SETTINGS_UPDATE'] },
  { key: 'volunteers', label: 'Volunteers', anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'scans', label: 'Scans', anyOf: ['REPORT_VIEW'] },
  { key: 'reports', label: 'Reports', anyOf: ['REPORT_VIEW'] },
  { key: 'donations', label: 'Donations', anyOf: ['DONATION_VIEW'] },
  { key: 'expenses', label: 'Expenses', anyOf: ['EXPENSE_VIEW'] },
  { key: 'settings', label: 'Settings', anyOf: ['EVENT_UPDATE'] },
];

export default function EventAdminPage() {
  const ev = useEvent();
  return (
    <AppShell title={ev.name} subtitle="Festival dashboard" back={`/e/${ev.eventId}`} wide>
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
      <Tabs tabs={visible} active={tab} onChange={change} />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'tokens' && <TokensTab />}
      {tab === 'slots' && <SlotsTab />}
      {tab === 'volunteers' && <VolunteersTab />}
      {tab === 'scans' && <ScansTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'donations' && <DonationsTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'settings' && (can(ev.perms, 'EVENT_UPDATE') ? <EventSettingsTab /> : null)}
    </div>
  );
}
