'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { Handshake, LogIn, Store, Ticket } from 'lucide-react';
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

  const safeNext = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/dashboard';

  useEffect(() => {
    if (!loading && me) router.replace(homeFor(me, safeNext));
  }, [loading, me, router, safeNext]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) return setError('Enter your mobile number or email, and your password.');
    setBusy(true);
    try {
      const user = await login(identifier.trim(), password);
      router.replace(homeFor(user, safeNext));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        const email = (err.body as { email?: string } | null)?.email ?? '';
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
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
      <div className="flex flex-col gap-1">
        <LabeledInput label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Link href="/forgot-password" className="self-end py-1 text-sm font-semibold text-orange-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        {!busy && <LogIn aria-hidden className="h-6 w-6" />}
        Log in
      </Button>
      <p className="text-center text-sm text-slate-600">
        New here?{' '}
        <Link href="/register?type=volunteer" className="font-semibold text-brand-700 underline">
          Volunteer sign-up
        </Link>
        {' · '}
        <Link href="/register?type=mandal" className="font-semibold text-brand-700 underline">
          Register your mandal
        </Link>
      </p>
      <Link
        href="/"
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 font-semibold text-orange-800 hover:bg-orange-100"
      >
        <Ticket aria-hidden className="h-5 w-5" /> Visiting a pandal? Book festival passes
      </Link>
      <Link
        href="/partner/signup"
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 font-semibold text-violet-800 ring-1 ring-violet-200 hover:from-violet-100 hover:to-fuchsia-100"
      >
        <Handshake aria-hidden className="h-5 w-5" /> Brands: become a promotional partner
      </Link>
      <Link
        href="/vendor/signup"
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 font-semibold text-teal-800 ring-1 ring-teal-200 hover:from-teal-100 hover:to-emerald-100"
      >
        <Store aria-hidden className="h-5 w-5" /> Stall vendors: book stalls at festivals
      </Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthCard title="Log in" subtitle="Welcome back 🙏">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
