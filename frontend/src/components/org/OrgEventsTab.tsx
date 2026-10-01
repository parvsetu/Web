'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import type { EventDetail } from '@/lib/types';
import { EventForm } from '../EventForm';
import { Alert, Badge, Button, Card, Empty, Modal, SkeletonList } from '../ui';
import { useOrgEvents } from './shared';

export function OrgEventsTab() {
  const org = useOrg();
  const router = useRouter();
  const { refresh } = useAuth();
  const q = useOrgEvents(org.orgId);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {can(org.perms, 'EVENT_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>New festival</Button>
        </div>
      )}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : (q.data ?? []).length === 0 ? (
        <Empty title="No festivals yet">Create one to start issuing tokens.</Empty>
      ) : (
        (q.data ?? []).map((e) => (
          <Card key={e.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{e.name}</span>
                <Badge value={e.status} />
              </div>
              <div className="text-sm text-slate-600">
                {humanize(e.festivalType)} · {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                {e.location ? ` · ${e.location}` : ''}
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`/e/${e.id}`} className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-3 text-sm font-semibold">
                Open
              </Link>
              <Link href={`/e/${e.id}/admin`} className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">
                Dashboard
              </Link>
            </div>
          </Card>
        ))
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New festival" wide>
        <EventForm
          submitLabel="Create festival"
          onSubmit={async (body) => {
            const created = await api.post<EventDetail>(`/organizations/${org.orgId}/events`, body);
            setCreating(false);
            await refresh();
            q.reload();
            if (created?.id) router.push(`/e/${created.id}/admin#slots`);
          }}
        />
      </Modal>
    </div>
  );
}
