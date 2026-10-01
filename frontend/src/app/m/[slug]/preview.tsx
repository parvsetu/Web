'use client';

import { PublicShell } from '@/components/booking/PublicShell';
import { LandingView } from '@/components/landing/LandingView';
import { Alert, SkeletonList } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/hooks';
import type { LandingPublic } from '@/lib/landing';

/** Editor preview of an inactive page: loads through the mandal admin's own session. */
export function LandingPreview({ slug }: { slug: string }) {
  const { me, loading } = useAuth();
  const org = me?.organizations.find((o) => o.slug === slug);
  const q = useAsync(() => api.get<LandingPublic>(`/organizations/${org!.id}/landing-page/preview`), [org?.id], !!org);
  return (
    <PublicShell wide>
      <div className="flex flex-col gap-4">
        <Alert kind="warning">Preview — visitors can&apos;t see this page until it is paid and switched on.</Alert>
        {loading || q.loading ? <SkeletonList /> : !org ? <Alert>Sign in as an admin of this mandal to preview its page.</Alert> : q.error ? <Alert>{q.error}</Alert> : q.data ? <LandingView p={q.data} url={typeof window !== 'undefined' ? window.location.href.split('?')[0] : ''} /> : null}
      </div>
    </PublicShell>
  );
}
