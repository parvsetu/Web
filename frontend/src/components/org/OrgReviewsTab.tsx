'use client';

import { useOrg } from '@/lib/org-context';
import { can } from '@/lib/permissions';
import { useAsync } from '@/lib/hooks';
import { fetchAll } from '@/lib/paged';
import type { EventDetail } from '@/lib/types';
import { ReviewModeration } from '../reviews/ReviewModeration';

/** Visitor reviews across all of the mandal's festivals. */
export function OrgReviewsTab() {
  const org = useOrg();
  const events = useAsync(() => fetchAll<EventDetail>(`/organizations/${org.orgId}/events`), [org.orgId]);
  return (
    <ReviewModeration
      base={`/organizations/${org.orgId}`}
      canManage={can(org.perms, 'REVIEW_MANAGE')}
      events={(events.data ?? []).map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
