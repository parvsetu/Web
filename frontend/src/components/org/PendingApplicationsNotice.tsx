'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import type { Paged } from '@/lib/types';
import { Hourglass } from 'lucide-react';

/**
 * Self-registered volunteers sit as PENDING applications until approved, so
 * they never appear in a Volunteers list. This points organisers at them.
 * Renders nothing when there are none or the viewer can't read them.
 */
export function PendingApplicationsNotice({ orgId, onOpen }: { orgId?: string; onOpen?: () => void }) {
  const q = useAsync(
    () => api.get<Paged<unknown>>(`/organizations/${orgId}/volunteer-applications`, { status: 'PENDING', pageSize: 1 }),
    [orgId],
    !!orgId,
  );
  const n = q.data?.total ?? 0;
  if (!orgId || n === 0) return null;

  const cls = 'inline-flex min-h-[40px] shrink-0 items-center rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-900">
        <Hourglass aria-hidden className="h-5 w-5 shrink-0" />
        <span>
          <strong>{n}</strong> {n === 1 ? 'person is' : 'people are'} waiting for approval to volunteer.
        </span>
      </div>
      {onOpen ? (
        <button type="button" onClick={onOpen} className={cls}>Review requests</button>
      ) : (
        <Link href={`/org/${orgId}#applications`} className={cls}>Review requests</Link>
      )}
    </div>
  );
}
