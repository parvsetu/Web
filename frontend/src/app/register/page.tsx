'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import type { PublicEvent } from '@/lib/types';
import { ArrowLeft, Building2, ChevronRight, HandHeart, UserPlus } from 'lucide-react';
import { Alert, Button, Field, LabeledInput, Select, Textarea, cx } from '@/components/ui';
import { AuthCard } from '@/components/AuthCard';
import { MandalRegistrationForm } from '@/components/registration/MandalRegistrationForm';

type Kind = 'choose' | 'volunteer' | 'mandal';

/**
 * /register asks what the person wants first: volunteer at a festival (the
 * original sign-up, unchanged) or register their mandal / organisation
 * (platform-reviewed). ?ref=CODE (agent referral link) or ?type=mandal opens
 * the mandal form directly.
 */
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterChooser />
    </Suspense>
  );
}

function RegisterChooser() {
  const params = useSearchParams();
  const ref = (params.get('ref') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [kind, setKind] = useState<Kind>(ref || params.get('type') === 'mandal' ? 'mandal' : params.get('type') === 'volunteer' ? 'volunteer' : 'choose');
  if (kind === 'volunteer') return <VolunteerRegister onBack={() => setKind('choose')} />;
  if (kind === 'mandal') return <MandalRegister referralCode={ref} onBack={() => setKind('choose')} />;
  return (
    <AuthCard title="Join Parvsetu" subtitle="What would you like to do?">
      <div className="flex flex-col gap-3">
        <ChoiceCard
          onClick={() => setKind('volunteer')}
          icon={HandHeart}
          tone="from-sky-400 to-blue-600"
          title="I want to volunteer at a festival"
          text="Help at the gate or token desk of a mandal’s festival."
        />
        <ChoiceCard
          onClick={() => setKind('mandal')}
          icon={Building2}
          tone="from-amber-400 via-orange-500 to-rose-500"
          title="Register my mandal / organisation"
          text="Run your festivals on Parvsetu — passes, gate scanning, donations and more."
        />
        <p className="text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand-700 underline">Log in</Link>
        </p>
      </div>
    </AuthCard>
  );
}

function ChoiceCard({ onClick, icon: Icon, tone, title, text }: { onClick: () => void; icon: typeof Building2; tone: string; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center gap-3 rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30">
      <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm', tone)}>
        <Icon aria-hidden className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-600">{text}</span>
      </span>
      <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-orange-400 group-hover:text-orange-600" />
    </button>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="-mt-2 mb-3 inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-orange-700 hover:underline">
      <ArrowLeft aria-hidden className="h-4 w-4" /> Back
    </button>
  );
}

function MandalRegister({ referralCode, onBack }: { referralCode: string; onBack: () => void }) {
  const { me, refresh } = useAuth();
  const router = useRouter();
  const blocked = me && (me.partner || me.agent);
  return (
    <AuthCard wide title="Register your mandal" subtitle="The Parvsetu team reviews every mandal before it goes live.">
      <BackLink onBack={onBack} />
      {blocked ? (
        <Alert kind="warning">
          {me?.agent ? <>Agents register mandals from the <Link href="/agent#register" className="font-semibold underline">agent dashboard</Link>.</> : 'Partner accounts can’t register a mandal.'}
        </Alert>
      ) : (
        <>
          {me && <Alert kind="info">You’re logged in as {me.name} — the registration is filed under your account.</Alert>}
          <div className={me ? 'mt-4' : ''}>
            <MandalRegistrationForm
              mode={me ? 'user' : 'self'}
              referralCode={referralCode}
              onSubmitted={async (r) => {
                if (r.email) router.replace(`/verify-email?email=${encodeURIComponent(r.email)}`);
                else {
                  await refresh();
                  router.replace('/registration');
                }
              }}
            />
          </div>
        </>
      )}
    </AuthCard>
  );
}

function VolunteerRegister({ onBack }: { onBack: () => void }) {
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
      <BackLink onBack={onBack} />
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
