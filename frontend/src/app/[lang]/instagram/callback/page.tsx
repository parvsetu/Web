'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, errorMessage, getToken } from '@/lib/api';
import { AuthCard } from '@/components/AuthCard';
import { Alert } from '@/components/ui';

/** Instagram sends the admin back here with ?code&state; the API finishes the connection and the first sync. */
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (params.get('error')) return setError(params.get('error_description') || 'Instagram access was not allowed, so nothing was connected.');
    if (!code || !state) return setError('This link is incomplete. Start again from your mandal’s Instagram tab.');
    if (!getToken()) {
      router.replace(`/login?next=${encodeURIComponent(`/instagram/callback?${params.toString()}`)}`);
      return;
    }
    api.post<{ organizationId: string; username: string; added: number }>('/instagram/callback', { code, state })
      .then((r) => router.replace(`/org/${r.organizationId}?ig=connected&added=${r.added}#instagram`))
      .catch((e) => setError(errorMessage(e)));
  }, [params, router]);

  return error ? (
    <div className="flex flex-col gap-4">
      <Alert>{error}</Alert>
      <Link href="/dashboard" className="text-center font-semibold text-orange-700 underline">Back to my mandals</Link>
    </div>
  ) : (
    <p className="flex items-center justify-center gap-2 py-6 text-slate-700"><Loader2 aria-hidden className="h-5 w-5 animate-spin" /> Connecting Instagram and fetching your photos…</p>
  );
}

export default function InstagramCallbackPage() {
  return (
    <AuthCard title="Connecting Instagram" subtitle="One moment">
      <Suspense><Callback /></Suspense>
    </AuthCard>
  );
}
