'use client';

import { useEffect, useState } from 'react';
import { api, asArray } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync, useDebounced } from '@/lib/hooks';
import type { Assignment, Paged, ScanLogRow } from '@/lib/types';
import { ScanRowCard } from '../ScanRow';
import { SearchBar } from '../SearchBar';
import { Alert, Card, Empty, LabeledInput, LabeledSelect, Pager, SkeletonList } from '../ui';
import { can } from '@/lib/permissions';

export const SCAN_RESULTS = ['SUCCESS', 'ALREADY_USED', 'EXPIRED', 'NOT_YET_VALID', 'CANCELLED', 'INVALID', 'WRONG_EVENT', 'UNAUTHORIZED'];

export function ScansTab() {
  const ev = useEvent();
  const [f, setF] = useState({ result: '', userId: '', date: '' });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const dq = useDebounced(search.trim());
  useEffect(() => setPage(1), [dq]);
  const q = useAsync(() => api.get<Paged<ScanLogRow>>(`/events/${ev.eventId}/scans`, { ...f, q: dq || undefined, page }), [ev.eventId, f, page, dq]);
  const people = useAsync(
    () => api.get<Assignment[] | Paged<Assignment>>(`/events/${ev.eventId}/assignments`, { pageSize: 200 }).then((r) => asArray(r)),
    [ev.eventId],
    can(ev.perms, 'VOLUNTEER_VIEW'),
  );
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <SearchBar value={search} onChange={setSearch} placeholder="Search token code or volunteer" total={q.data?.total} />
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <LabeledSelect label="Result" value={f.result} onChange={(e) => set('result')(e.target.value)}>
          <option value="">All</option>
          {SCAN_RESULTS.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, ' ')}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Volunteer" value={f.userId} onChange={(e) => set('userId')(e.target.value)}>
          <option value="">All</option>
          {(people.data ?? []).map((a) => {
            const id = a.user?.id ?? a.userId ?? '';
            return id ? (
              <option key={a.id} value={id}>
                {a.user?.name ?? a.name}
              </option>
            ) : null;
          })}
        </LabeledSelect>
        <div className="col-span-2 sm:col-span-1">
          <LabeledInput label="Date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
        </div>
      </Card>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.data && q.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {q.data.items.map((s) => (
              <ScanRowCard key={s.id} row={s} tz={ev.timezone} showUser />
            ))}
          </div>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </div>
      ) : (
        <Empty title="No scans match" />
      )}
    </div>
  );
}
