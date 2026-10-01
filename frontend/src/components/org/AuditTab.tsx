'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { fmtDateTime, humanize } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import type { AuditLog, Paged } from '@/lib/types';
import { Alert, Card, Empty, LabeledInput, LabeledSelect, Pager, SkeletonList } from '../ui';
import { useOrgEvents } from './shared';

function short(v: unknown): string {
  if (v === null || v === undefined) return '';
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  } catch {
    return '';
  }
}

export function AuditTab() {
  const org = useOrg();
  const events = useOrgEvents(org.orgId);
  const [eventId, setEventId] = useState('');
  const [actionText, setActionText] = useState('');
  const action = useDebounced(actionText.trim().toUpperCase());
  const [page, setPage] = useState(1);
  const q = useAsync(
    () => api.get<Paged<AuditLog>>(`/organizations/${org.orgId}/audit-logs`, { eventId, action, page }),
    [org.orgId, eventId, action, page],
  );
  const evName = (id: string | null) => (id ? events.data?.find((e) => e.id === id)?.name : null);

  return (
    <div className="flex flex-col gap-3">
      <Card className="grid grid-cols-2 gap-3">
        <LabeledSelect
          label="Festival"
          value={eventId}
          onChange={(e) => {
            setEventId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All</option>
          {(events.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </LabeledSelect>
        <LabeledInput
          label="Action"
          value={actionText}
          onChange={(e) => {
            setActionText(e.target.value);
            setPage(1);
          }}
          placeholder="e.g. TOKEN_REACTIVATE"
        />
      </Card>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : q.data && q.data.items.length > 0 ? (
        <>
          {q.data.items.map((a) => (
            <Card key={a.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold">{a.action}</span>
                <span className="text-xs text-slate-500">{fmtDateTime(a.createdAt)}</span>
              </div>
              <div className="mt-1 text-sm text-slate-700">
                {a.actor?.name ?? 'System'} · {humanize(a.entityType)}
                {evName(a.eventId) ? ` · ${evName(a.eventId)}` : ''}
              </div>
              {a.reason && <div className="mt-1 text-sm">Reason: {a.reason}</div>}
              {(a.before !== null && a.before !== undefined) || (a.after !== null && a.after !== undefined) ? (
                <details className="mt-1 text-xs text-slate-600">
                  <summary className="cursor-pointer py-1">Changes</summary>
                  {a.before != null && <div className="break-all">Before: {short(a.before)}</div>}
                  {a.after != null && <div className="break-all">After: {short(a.after)}</div>}
                </details>
              ) : null}
            </Card>
          ))}
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      ) : (
        <Empty title="No audit entries" />
      )}
    </div>
  );
}
