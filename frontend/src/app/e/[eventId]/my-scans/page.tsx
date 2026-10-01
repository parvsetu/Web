'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import type { Paged, ScanLogRow } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { Alert, Empty, Pager, SkeletonList } from '@/components/ui';
import { ScanRowCard } from '@/components/ScanRow';

export default function MyScansPage() {
  const ev = useEvent();
  return (
    <AppShell title="My scans" subtitle={ev.name} back={`/e/${ev.eventId}`}>
      <EventGate anyOf={['TOKEN_SCAN']}>
        <List />
      </EventGate>
    </AppShell>
  );
}

function List() {
  const ev = useEvent();
  const [page, setPage] = useState(1);
  const q = useAsync(() => api.get<Paged<ScanLogRow>>('/me/scans', { eventId: ev.eventId, page }), [ev.eventId, page]);
  if (q.loading) return <SkeletonList />;
  if (q.error) return <Alert>{q.error}</Alert>;
  if (!q.data || q.data.items.length === 0) return <Empty title="No scans yet" />;
  return (
    <div className="flex flex-col gap-2">
      {q.data.items.map((s) => (
        <ScanRowCard key={s.id} row={s} tz={ev.timezone} />
      ))}
      <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
    </div>
  );
}
