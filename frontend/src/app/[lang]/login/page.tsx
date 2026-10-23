'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ApiError, errorMessage } from '@/lib/api';
import { homeFor, safeRedirectPath, useAuth } from '@/lib/auth';
import { Handshake, LogIn, Megaphone, Store, Ticket } from 'lucide-react';
import { Alert, Button, LabeledInput } from '@/components/ui';
import { AuthCard } from '@/components/AuthCard';

function LoginForm({ next }: { next: string | null }) {
  const { login, me, loading } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const safeNext = safeNextPath(next);
  const vendor = isVendorNext(safeNext);
  const festival = vendor ? new URLSearchParams(safeNext.split('?')[1] ?? '').get('festival') : null;

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
      <LabeledInput required
        label="Mobile number or email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="9876543210"
      />
      <div className="flex flex-col gap-1">
        <LabeledInput required label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Link href="/forgot-password" className="self-end py-1 text-sm font-semibold text-orange-700 hover:underline">
          Forgot password?
        </Link>
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        {!busy && <LogIn aria-hidden className="h-6 w-6" />}
        Log in
      </Button>
      {vendor && (
        <Link
          href={festival ? `/vendor/signup?festival=${encodeURIComponent(festival)}` : '/vendor/signup'}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-teal-300 bg-teal-50 font-semibold text-teal-800 hover:bg-teal-100"
        >
          <Store aria-hidden className="h-5 w-5" /> New stall vendor? Create a vendor account
        </Link>
      )}
      {!vendor && (
      <>
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
      <Link
        href="/blogger/signup"
        className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-50 to-rose-50 font-semibold text-pink-800 ring-1 ring-pink-200 hover:from-pink-100 hover:to-rose-100"
      >
        <Megaphone aria-hidden className="h-5 w-5" /> Bloggers &amp; influencers: earn by promoting festivals
      </Link>
      </>
      )}
    </form>
  );
}

function safeNextPath(next: string | null): string {
  const safe = safeRedirectPath(next);
  return safe && !safe.startsWith('/login') ? safe : '/dashboard';
}

/** "Book a stall" sends visitors here with next=/vendor?festival=… — show the stall-vendor login. */
function isVendorNext(path: string) {
  return path === '/vendor' || path.startsWith('/vendor?') || path.startsWith('/vendor#');
}

function LoginScreen() {
  const next = useSearchParams().get('next');
  const vendor = isVendorNext(safeNextPath(next));
  return (
    <AuthCard title={vendor ? 'Stall vendor log in' : 'Log in'} subtitle={vendor ? 'Log in to book your stall 🙏' : 'Welcome back 🙏'}>
      <LoginForm next={next} />
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
