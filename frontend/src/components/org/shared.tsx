'use client';

import { useState } from 'react';
import { api, asArray } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import type { EventDetail, MeEvent, Paged, Role } from '@/lib/types';
import { Button } from '../ui';

export type OrgEvent = Pick<EventDetail, 'id' | 'name' | 'festivalType' | 'status' | 'startDate' | 'endDate'> &
  Partial<Pick<EventDetail, 'location' | 'timezone'>>;

export function useOrgEvents(orgId: string, enabled = true) {
  return useAsync(
    () => api.get<OrgEvent[] | Paged<OrgEvent> | MeEvent[]>(`/organizations/${orgId}/events`).then((r) => asArray(r as OrgEvent[])),
    [orgId],
    enabled,
  );
}

export function useRoles(orgId: string, enabled = true) {
  return useAsync(() => api.get<Role[] | Paged<Role>>(`/organizations/${orgId}/roles`).then((r) => asArray(r)), [orgId], enabled);
}

/** Shows a one-time temporary password with a copy button and a clear warning. */
export function TempPassword({ password, who }: { password: string; who: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
      <p className="font-bold text-amber-900">Temporary password for {who}</p>
      <p className="mt-1 text-sm text-amber-900">This is shown only once. Give it to them now — they should change it after logging in.</p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 select-all break-all rounded-xl bg-white px-3 py-3 font-mono text-xl font-bold tracking-wider">{password}</code>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
