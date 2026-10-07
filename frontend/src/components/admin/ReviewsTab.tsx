'use client';

import { useEvent } from '@/lib/event-context';
import { can } from '@/lib/permissions';
import { ReviewModeration } from '../reviews/ReviewModeration';

/** Visitor reviews of this festival. */
export function ReviewsTab() {
  const ev = useEvent();
  return <ReviewModeration base={`/events/${ev.eventId}`} canManage={can(ev.perms, 'REVIEW_MANAGE')} />;
}
