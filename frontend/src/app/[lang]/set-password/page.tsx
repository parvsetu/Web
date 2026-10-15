'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, errorMessage, setToken } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import type { AuthResponse } from '@/lib/types';
import { AuthCard } from '@/components/AuthCard';
import { Alert, Button, LabeledInput } from '@/components/ui';

/** Single-use link from an agent-filed registration: choose a password (also confirms the email). */
function SetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    setBusy(true);
    try {
      const res = await api.post<AuthResponse>('/auth/set-password', { token, password }, { noAuthRedirect: true });
      setToken(res.accessToken);
      await refresh();
      router.replace(homeFor(res.user));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <Alert kind="warning">This link is incomplete. Open the link from your email again, or <Link href="/forgot-password" className="underline">reset your password</Link>.</Alert>;
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <LabeledInput label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters" />
      <LabeledInput label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        {!busy && <KeyRound aria-hidden className="h-6 w-6" />}
        Set password &amp; continue
      </Button>
      <p className="text-center text-sm text-slate-600">
        Link expired? <Link href="/forgot-password" className="font-semibold text-orange-700 underline">Get a code instead</Link>
      </p>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <AuthCard title="Set your password" subtitle="Your mandal was registered on Parvsetu by a field agent.">
      <Suspense>
        <SetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
