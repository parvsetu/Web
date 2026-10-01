'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';
import { UserPlus } from 'lucide-react';
import { Alert, Button, Field, LabeledInput, Select, Textarea } from '@/components/ui';
import { AuthCard } from '@/components/AuthCard';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [form, setForm] = useState({ name: '', mobile: '', email: '', password: '', eventId: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<PublicEvent[]>('/public/events', undefined, { noAuthRedirect: true })
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Please enter your name.';
    if (!/^[6-9]\d{9}$/.test(form.mobile.replace(/\D/g, '').slice(-10)) || form.mobile.replace(/\D/g, '').length < 10)
      errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email — we will send a code to activate your account.';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    const ev = events.find((x) => x.id === form.eventId);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      mobile: form.mobile.trim(),
      password: form.password,
    };
    body.email = form.email.trim();
    if (ev) {
      body.organizationId = ev.organization.id;
      body.eventId = ev.id;
      if (form.message.trim()) body.message = form.message.trim();
    }
    setBusy(true);
    try {
      const res = await register(body);
      router.replace(`/verify-email?email=${encodeURIComponent(res.email)}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create account" subtitle="Sign up to volunteer at a festival.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <LabeledInput label="Your name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} />
        <LabeledInput label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="9876543210" />
        <LabeledInput label="Email" hint="We will send a 6-digit code to activate your account." type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} error={errors.email} />
        <LabeledInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
        <Field label="Which festival do you want to volunteer for? (optional)" htmlFor="reg-event">
          <Select id="reg-event" value={form.eventId} onChange={set('eventId')}>
            <option value="">— Not now —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {ev.organization.name} ({fmtDate(ev.startDate)})
              </option>
            ))}
          </Select>
        </Field>
        {form.eventId && (
          <>
            <p className="text-xs text-slate-500">
              {(() => {
                const ev = events.find((x) => x.id === form.eventId);
                return ev ? `${humanize(ev.festivalType)}${ev.location ? ` · ${ev.location}` : ''}. The mandal will review your request.` : '';
              })()}
            </p>
            <Field label="Message to the mandal (optional)" htmlFor="reg-msg">
              <Textarea id="reg-msg" value={form.message} onChange={set('message')} maxLength={500} placeholder="e.g. I can help at the gate in the evenings." />
            </Field>
          </>
        )}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={busy}>
          {!busy && <UserPlus aria-hidden className="h-6 w-6" />}
          Create account
        </Button>
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700 underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
