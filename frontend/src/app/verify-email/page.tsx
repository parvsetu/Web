'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { MailCheck, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
import { OtpInput, ResendButton } from '@/components/OtpInput';
import { Alert, Button } from '@/components/ui';

function VerifyForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { verifyEmail } = useAuth();
  const email = params.get('email') ?? '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.');
    setBusy(true);
    try {
      const user = await verifyEmail(email, code);
      router.replace(homeFor(user));
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (!email) {
    return (
      <Alert kind="warning">
        Missing email address. <Link href="/login" className="underline">Go to login</Link>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      <div className="flex items-center gap-3 rounded-2xl bg-orange-50 p-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
          <MailCheck aria-hidden className="h-6 w-6" />
        </span>
        <p className="text-sm text-slate-700">
          We sent a 6-digit code to <span className="font-semibold">{email}</span>. It expires in 10 minutes.
        </p>
      </div>
      <OtpInput value={code} onChange={setCode} disabled={busy} />
      {error && <Alert>{error}</Alert>}
      {info && <Alert kind="success">{info}</Alert>}
      <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6}>
        {!busy && <ShieldCheck aria-hidden className="h-6 w-6" />}
        Verify &amp; continue
      </Button>
      <div className="flex flex-col items-center gap-1">
        <ResendButton
          initialWait={params.get('sent') === '0' ? 0 : 60}
          onResend={async () => {
            setError(null);
            await api.post('/auth/resend-verification', { email }, { noAuthRedirect: true });
            setInfo('A new code is on its way. Check your inbox and spam folder.');
          }}
        />
        <Link href="/login" className="text-sm font-semibold text-orange-700 underline">
          Back to login
        </Link>
      </div>
    </form>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Verify your email" subtitle="One last step to activate your account.">
      <Suspense>
        <VerifyForm />
      </Suspense>
    </AuthCard>
  );
}
