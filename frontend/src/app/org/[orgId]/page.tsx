'use client';

import { useEffect, useMemo, useState } from 'react';
import { useOrg } from '@/lib/org-context';
import { canAny } from '@/lib/permissions';
import type { Permission } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { Alert, SkeletonList, Tabs } from '@/components/ui';
import { OrgEventsTab } from '@/components/org/OrgEventsTab';
import { OrgVolunteersTab } from '@/components/org/OrgVolunteersTab';
import { ApplicationsTab } from '@/components/org/ApplicationsTab';
import { MembersTab } from '@/components/org/MembersTab';
import { RolesTab } from '@/components/org/RolesTab';
import { AuditTab } from '@/components/org/AuditTab';
import { OrgReportsTab } from '@/components/org/OrgReportsTab';
import { OrgSettingsTab } from '@/components/org/OrgSettingsTab';

const TABS: { key: string; label: string; anyOf: Permission[] }[] = [
  { key: 'events', label: 'Festivals', anyOf: ['EVENT_VIEW'] },
  { key: 'volunteers', label: 'Volunteers', anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'applications', label: 'Applications', anyOf: ['VOLUNTEER_VIEW'] },
  { key: 'members', label: 'Members', anyOf: ['USER_VIEW'] },
  { key: 'roles', label: 'Roles', anyOf: ['ROLE_VIEW'] },
  { key: 'audit', label: 'Audit log', anyOf: ['AUDIT_VIEW'] },
  { key: 'reports', label: 'Reports', anyOf: ['REPORT_VIEW'] },
  { key: 'settings', label: 'Settings', anyOf: ['SETTINGS_UPDATE'] },
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

  if (org.loading) return <SkeletonList />;
  if (visible.length === 0) return <Alert kind="warning">You do not have admin access to this mandal.</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={visible} active={tab} onChange={change} />
      {tab === 'events' && <OrgEventsTab />}
      {tab === 'volunteers' && <OrgVolunteersTab />}
      {tab === 'applications' && <ApplicationsTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'reports' && <OrgReportsTab />}
      {tab === 'settings' && <OrgSettingsTab />}
    </div>
  );
}
