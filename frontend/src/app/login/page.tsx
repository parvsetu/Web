'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { isAwaitingApproval, useAuth } from '@/lib/auth';
import { Alert, Button, LabeledInput } from '@/components/ui';
import { AuthCard } from '@/components/AuthCard';

function LoginForm() {
  const { login, me, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';

  useEffect(() => {
    if (!loading && me) router.replace(isAwaitingApproval(me) ? '/awaiting' : safeNext);
  }, [loading, me, router, safeNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) return setError('Enter your mobile number or email, and your password.');
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password);
      router.replace(isAwaitingApproval(user) ? '/awaiting' : safeNext);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <LabeledInput
        label="Mobile number or email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="9876543210"
      />
      <LabeledInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        Log in
      </Button>
      <p className="text-center text-sm text-slate-600">
        New volunteer?{' '}
        <Link href="/register" className="font-semibold text-brand-700 underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Log in" subtitle="Welcome to Parvsetu">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
