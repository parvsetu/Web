'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEvent } from '@/lib/event-context';
import type { Permission } from '@/lib/types';
import { canAny } from '@/lib/permissions';
import { Alert, SkeletonList } from './ui';

export const NOT_LIVE_NOTE = 'This festival is waiting for platform approval and the registration fee. Passes, scanning, donations, volunteers, stalls, competitions and expenses unlock once it is live — you can keep setting it up meanwhile.';

/** Renders children only when the event is loaded, the user has one of `anyOf`, and (with `liveOnly`) the festival is LIVE. UI hint only. */
export function EventGate({ anyOf, liveOnly, children }: { anyOf?: Permission[]; liveOnly?: boolean; children: ReactNode }) {
  const ev = useEvent();
  if (ev.loading) return <SkeletonList />;
  if (ev.notFound)
    return (
      <Alert>
        This festival was not found, or you do not have access to it. <Link href="/dashboard" className="underline">Go back</Link>
      </Alert>
    );
  if (anyOf && !canAny(ev.perms, anyOf))
    return (
      <Alert kind="warning">
        You do not have permission to open this page. <Link href={`/e/${ev.eventId}`} className="underline">Go back</Link>
      </Alert>
    );
  if (liveOnly && !ev.live)
    return (
      <Alert kind="warning">
        {NOT_LIVE_NOTE} <Link href={`/e/${ev.eventId}/admin`} className="underline">Open the festival dashboard</Link>
      </Alert>
    );
  return <>{children}</>;
}
