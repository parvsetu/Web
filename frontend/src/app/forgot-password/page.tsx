'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, KeyRound, LogIn, Send } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { AuthCard } from '@/components/AuthCard';
import { OtpInput, ResendButton } from '@/components/OtpInput';
import { Alert, Button, LabeledInput } from '@/components/ui';

type Step = 'request' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function request(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (identifier.trim().length < 3) return setError('Enter your mobile number or email.');
    setBusy(true);
    try {
      await api.post('/auth/forgot-password', { identifier: identifier.trim() }, { noAuthRedirect: true });
      setStep('reset');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (code.length !== 6) return setError('Enter the 6-digit code from your email.');
    if (password.length < 8) return setError('New password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { identifier: identifier.trim(), code, newPassword: password }, { noAuthRedirect: true });
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={step === 'done' ? 'Password changed' : 'Forgot password'}
      subtitle={step === 'request' ? 'We will email you a code to set a new password.' : step === 'reset' ? 'Enter the code and choose a new password.' : undefined}
    >
      {step === 'request' && (
        <form onSubmit={request} className="flex flex-col gap-4" noValidate>
          <LabeledInput
            label="Mobile number or email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="9876543210"
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            {!busy && <Send aria-hidden className="h-5 w-5" />}
            Send code
          </Button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={reset} className="flex flex-col gap-4" noValidate>
          <Alert kind="info">
            If an account matches <span className="font-semibold">{identifier}</span> and has an email address, a 6-digit code has been sent to that email.
          </Alert>
          <OtpInput value={code} onChange={setCode} disabled={busy} />
          <LabeledInput label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
          <LabeledInput label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            {!busy && <KeyRound aria-hidden className="h-5 w-5" />}
            Set new password
          </Button>
          <div className="flex justify-center">
            <ResendButton
              onResend={async () => {
                await api.post('/auth/forgot-password', { identifier: identifier.trim() }, { noAuthRedirect: true });
              }}
            />
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 aria-hidden className="h-9 w-9" />
          </span>
          <p className="text-slate-700">Your password has been changed and you have been signed out on other devices.</p>
          <Link href="/login" className="w-full">
            <Button size="lg" className="w-full">
              <LogIn aria-hidden className="h-5 w-5" /> Log in
            </Button>
          </Link>
        </div>
      )}

      {step !== 'done' && (
        <p className="mt-4 text-center text-sm text-slate-600">
          Remembered it?{' '}
          <Link href="/login" className="font-semibold text-orange-700 underline">
            Log in
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
