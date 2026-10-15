'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import { loadSavedPasses } from '@/lib/booking';
import { Spinner } from '@/components/ui';

/**
 * Where the home-screen app opens (manifest start_url). Organisers, agents,
 * vendors and bloggers (signed in) go to their dashboard; visitors with
 * passes on this phone go to My passes; everyone else to the explore page.
 */
export default function LaunchPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getToken() ? '/dashboard' : loadSavedPasses().length ? '/book/my-passes' : '/');
  }, [router]);
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#fffaf3]">
      <Spinner />
    </div>
  );
}
