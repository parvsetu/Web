'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Instagram } from 'lucide-react';
import { AuthCard } from '@/components/AuthCard';
import { Alert, Button } from '@/components/ui';

/** Simulated Instagram login (development only — the API refuses the simulation in production). */
function DemoAuthorize() {
  const params = useSearchParams();
  const router = useRouter();
  const state = params.get('state') ?? '';
  const go = (allow: boolean) => {
    const q = new URLSearchParams(allow ? { code: `demo_${Math.random().toString(36).slice(2, 12)}`, state } : { error: 'access_denied', error_description: 'You chose not to connect Instagram.', state });
    router.replace(`/instagram/callback?${q}`);
  };
  return (
    <div className="flex flex-col gap-4">
      <Alert kind="warning">Simulated Instagram for testing — no real account is used, and the photos are sample images.</Alert>
      <p className="text-slate-700">Parvsetu would like to read your profile and posts so your mandal can show selected photos on its page. It can’t post or see messages.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => go(false)}>Cancel</Button>
        <Button onClick={() => go(true)}><Instagram aria-hidden className="h-4 w-4" /> Allow</Button>
      </div>
    </div>
  );
}

export default function DemoAuthorizePage() {
  return (
    <AuthCard title="Instagram (simulated)" subtitle="Allow access to your photos?">
      <Suspense><DemoAuthorize /></Suspense>
    </AuthCard>
  );
}
