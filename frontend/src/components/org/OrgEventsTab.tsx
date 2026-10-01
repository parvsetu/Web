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
import { Alert, Badge, Button, Card, Empty, Modal, Pager, SkeletonList } from '../ui';
import { usePagedList } from '@/lib/paged';
import { SearchBar } from '../SearchBar';
import { BarChart3, CalendarDays, CalendarPlus, DoorOpen, MapPin, PartyPopper } from 'lucide-react';
import { festivalTheme } from '@/lib/festival-theme';
import { FestivalBadge } from '../FestivalBanner';

export function OrgEventsTab() {
  const org = useOrg();
  const router = useRouter();
  const { refresh } = useAuth();
  const q = usePagedList<EventDetail>(`/organizations/${org.orgId}/events`, {}, { pageSize: 10 });
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {can(org.perms, 'EVENT_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}><CalendarPlus aria-hidden className="h-4 w-4" /> New festival</Button>
        </div>
      )}
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search festival, type or city" total={q.total} />
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.items.length === 0 ? (
        q.searching ? <Empty title="No festivals match your search" /> : <Empty icon={PartyPopper} title="No festivals yet">Create one to start issuing tokens.</Empty>
      ) : (
        q.items.map((e) => (
          <Card key={e.id} className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <FestivalBadge type={e.festivalType} className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold uppercase tracking-wider" style={{ color: festivalTheme(e.festivalType).ink }}>
                  {humanize(e.festivalType)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{e.name}</span>
                  <Badge value={e.status} />
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <CalendarDays aria-hidden className="h-4 w-4 text-slate-400" /> {fmtDate(e.startDate)} – {fmtDate(e.endDate)}
                </div>
                {e.location && (
                  <div className="flex items-center gap-1.5 text-sm text-slate-600">
                    <MapPin aria-hidden className="h-4 w-4 text-slate-400" /> {e.location}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/e/${e.id}`} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-orange-200 px-3 text-sm font-semibold hover:bg-orange-50">
                <DoorOpen aria-hidden className="h-4 w-4" /> Open
              </Link>
              <Link
                href={`/e/${e.id}/admin`}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-3 text-sm font-semibold text-white shadow-sm"
              >
                <BarChart3 aria-hidden className="h-4 w-4" /> Dashboard
              </Link>
            </div>
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
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
