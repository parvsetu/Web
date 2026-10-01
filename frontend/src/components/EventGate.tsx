'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEvent } from '@/lib/event-context';
import type { Permission } from '@/lib/types';
import { canAny } from '@/lib/permissions';
import { Alert, SkeletonList } from './ui';

/** Renders children only when the event is loaded and the user has one of `anyOf` (UI hint only). */
export function EventGate({ anyOf, children }: { anyOf?: Permission[]; children: ReactNode }) {
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
  return <>{children}</>;
}
