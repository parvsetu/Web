'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BadgeCheck, Briefcase, Building2, CalendarDays, ChevronRight, KeyRound, LogOut, Mail, MonitorSmartphone, Phone, Save, ShieldCheck, User, UserCog } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { OtpInput } from '@/components/OtpInput';
import { Alert, Badge, Button, Card, LabeledInput, PasswordInput } from '@/components/ui';
import { api, errorMessage, setToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate, humanize } from '@/lib/format';
import type { MeUser } from '@/lib/types';

export default function ProfilePage() {
  return (
    <AppShell title="My profile" back="/dashboard" wide>
      <Profile />
    </AppShell>
  );
}

function Profile() {
  const { me } = useAuth();
  if (!me) return null;
  const initials = me.name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex flex-col gap-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-rose-500 p-5 text-white shadow-lg sm:p-6">
        <span aria-hidden className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/95 text-2xl font-extrabold text-fuchsia-600 shadow-md ring-4 ring-white/40">{initials || '?'}</span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold">{me.name}</h1>
            <p className="truncate text-sm text-white/90">{[me.mobile, me.email].filter(Boolean).join(' · ')}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
              {me.isSuperAdmin && <span className="rounded-full bg-white/25 px-2 py-0.5">Platform admin</span>}
              {me.partner && <span className="rounded-full bg-white/25 px-2 py-0.5">Partner · {me.partner.name}</span>}
              {me.agent && <span className="rounded-full bg-white/25 px-2 py-0.5">Field agent · {me.agent.code}</span>}
              {me.organizations.length > 0 && !me.isSuperAdmin && (
                <span className="rounded-full bg-white/25 px-2 py-0.5">
                  {me.organizations.length} mandal{me.organizations.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <DetailsCard me={me} />
          <EmailCard me={me} />
        </div>
        <div className="flex flex-col gap-4">
          <SecurityCard />
          {me.agent ? <AgentCard me={me} /> : !me.partner && <AccessCard me={me} />}
        </div>
      </div>
    </div>
  );
}

function CardTitle({ icon: Icon, tone, children }: { icon: typeof User; tone: string; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-slate-900">
      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>
        <Icon aria-hidden className="h-4 w-4" />
      </span>
      {children}
    </h2>
  );
}

function DetailsCard({ me }: { me: MeUser }) {
  const { refresh } = useAuth();
  const [name, setName] = useState(me.name);
  const [mobile, setMobile] = useState(me.mobile ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loginChanged = mobile.replace(/[\s\-()]/g, '') !== (me.mobile ?? '') || email.trim().toLowerCase() !== (me.email ?? '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (name.trim().length < 2) return setError('Enter your name (at least 2 letters).');
    if (loginChanged && !password) return setError('Enter your current password to change your mobile number or email.');
    setBusy(true);
    try {
      const r = await api.patch<MeUser & { verificationSent?: boolean }>('/auth/me', {
        name: name.trim(),
        ...(mobile.replace(/[\s\-()]/g, '') !== (me.mobile ?? '') ? { mobile } : {}),
        ...(email.trim().toLowerCase() !== (me.email ?? '') && email.trim() ? { email: email.trim() } : {}),
        ...(loginChanged ? { currentPassword: password } : {}),
      });
      setPassword('');
      setOk(r.verificationSent ? 'Saved. We sent a 6-digit code to your new email — enter it below to verify.' : 'Saved.');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardTitle icon={UserCog} tone="bg-orange-100 text-orange-600">Personal details</CardTitle>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <LabeledInput label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        <LabeledInput label="Mobile number (used to log in)" value={mobile} onChange={(e) => setMobile(e.target.value)} inputMode="tel" autoComplete="tel" />
        <LabeledInput label="Email (used to log in and reset password)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {loginChanged && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Current password</span>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <span className="text-xs text-slate-500">Needed because your login details are changing.</span>
          </label>
        )}
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save changes
        </Button>
      </form>
    </Card>
  );
}

function EmailCard({ me }: { me: MeUser }) {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  if (!me.email) {
    return (
      <Card>
        <CardTitle icon={Mail} tone="bg-sky-100 text-sky-600">Email</CardTitle>
        <p className="text-sm text-slate-600">Add an email above so you can reset your password and receive receipts and alerts.</p>
      </Card>
    );
  }
  if (me.emailVerified) {
    return (
      <Card>
        <CardTitle icon={Mail} tone="bg-sky-100 text-sky-600">Email</CardTitle>
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <BadgeCheck aria-hidden className="h-5 w-5 text-green-600" /> <span className="font-semibold">{me.email}</span> is verified.
        </p>
      </Card>
    );
  }

  async function send() {
    setError(null);
    setBusy('send');
    try {
      const r = await api.post<{ sent: boolean; maskedEmail?: string }>('/auth/me/email/send-code', {});
      setSent(r.maskedEmail ?? me.email);
      setCooldown(60);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  async function verify() {
    setError(null);
    setBusy('verify');
    try {
      await api.post('/auth/me/email/verify', { code });
      setCode('');
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardTitle icon={Mail} tone="bg-sky-100 text-sky-600">Verify your email</CardTitle>
      <p className="text-sm text-slate-600">
        <span className="font-semibold">{me.email}</span> is not verified yet. Verify it so password reset works.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {sent && <Alert kind="info">Code sent to {sent}. It is valid for 10 minutes.</Alert>}
        <OtpInput value={code} onChange={setCode} disabled={busy === 'verify'} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button onClick={verify} loading={busy === 'verify'} disabled={code.length !== 6}>
            Verify
          </Button>
          <Button variant="secondary" onClick={send} loading={busy === 'send'} disabled={cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : sent ? 'Resend code' : 'Send code'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SecurityCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pw' | 'devices' | null>(null);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('New passwords do not match.');
    setBusy('pw');
    try {
      const r = await api.post<{ accessToken: string }>('/auth/change-password', { currentPassword: current, newPassword: next }, { noAuthRedirect: true });
      setToken(r.accessToken);
      setCurrent('');
      setNext('');
      setConfirm('');
      setOk('Password changed. You stay signed in here; other devices were signed out.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function signOutOthers() {
    setError(null);
    setOk(null);
    setBusy('devices');
    try {
      const r = await api.post<{ accessToken: string }>('/auth/logout-other-devices', {});
      setToken(r.accessToken);
      setOk('Signed out of every other phone and browser.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardTitle icon={KeyRound} tone="bg-amber-100 text-amber-600">Password &amp; security</CardTitle>
      <form onSubmit={changePassword} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate-700">Current password</span>
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">New password</span>
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <span className="text-xs text-slate-500">At least 8 characters</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Confirm new password</span>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
        </div>
        <Button type="submit" loading={busy === 'pw'} disabled={!current || !next}>
          <KeyRound aria-hidden className="h-4 w-4" /> Change password
        </Button>
      </form>
      <div className="mt-4 flex flex-col gap-2 border-t border-orange-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <MonitorSmartphone aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          Lost a phone or used a shared computer? Sign out everywhere else.
        </p>
        <Button variant="secondary" onClick={signOutOthers} loading={busy === 'devices'}>
          <LogOut aria-hidden className="h-4 w-4" /> Sign out other devices
        </Button>
      </div>
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
      {ok && <div className="mt-3"><Alert kind="success">{ok}</Alert></div>}
    </Card>
  );
}

/** Field agents: their code and a way back to the agent dashboard (they have no mandal access). */
function AgentCard({ me }: { me: MeUser }) {
  const a = me.agent!;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Briefcase aria-hidden className="h-5 w-5 text-emerald-600" /> Field agent</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Referral code</span>
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono font-bold tracking-wider text-emerald-900 ring-1 ring-emerald-200">{a.code}</span>
        <Badge value={a.status} />
      </div>
      <Link href="/agent" className="flex min-h-[48px] items-center gap-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-4 font-semibold text-white">
        <span className="flex-1">Open agent dashboard</span>
        <ChevronRight aria-hidden className="h-5 w-5" />
      </Link>
    </Card>
  );
}

function AccessCard({ me }: { me: MeUser }) {
  const orgs = me.isSuperAdmin ? [] : me.organizations;
  const events = me.events.slice(0, 12);
  const pending = me.applications.filter((a) => a.status === 'PENDING');
  return (
    <Card>
      <CardTitle icon={ShieldCheck} tone="bg-violet-100 text-violet-600">My access</CardTitle>
      {me.isSuperAdmin && (
        <Link href="/platform" className="mb-3 flex min-h-[52px] items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 font-semibold text-violet-900">
          <ShieldCheck aria-hidden className="h-5 w-5" /> <span className="flex-1">Platform admin — every mandal</span> <ChevronRight aria-hidden className="h-4 w-4" />
        </Link>
      )}
      {orgs.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Mandals</h3>
          <ul className="flex flex-col gap-1.5">
            {orgs.map((o) => (
              <li key={o.id}>
                <Link href={`/org/${o.id}`} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-orange-100 px-3 hover:bg-orange-50">
                  <Building2 aria-hidden className="h-5 w-5 text-orange-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{o.name}</span>
                    <span className="block text-xs text-slate-500">{o.role?.name ?? 'Member'}</span>
                  </span>
                  <ChevronRight aria-hidden className="h-4 w-4 text-orange-400" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {events.length > 0 && (
        <div className="mb-3">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Festivals</h3>
          <ul className="flex flex-col gap-1.5">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/e/${e.id}`} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-orange-100 px-3 hover:bg-orange-50">
                  <CalendarDays aria-hidden className="h-5 w-5 text-rose-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {e.organization.name} · {fmtDate(e.startDate)}
                    </span>
                  </span>
                  <Badge value={e.status} />
                </Link>
              </li>
            ))}
          </ul>
          {me.events.length > events.length && (
            <Link href="/dashboard" className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-orange-700">
              All {me.events.length} festivals <ChevronRight aria-hidden className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
      {pending.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">Waiting for approval</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {pending.map((a) => (
              <li key={a.id} className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
                {a.organization?.name ?? 'Mandal'}
                {a.event ? ` · ${a.event.name}` : ''} — {humanize(a.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!me.isSuperAdmin && orgs.length === 0 && events.length === 0 && pending.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Phone aria-hidden className="h-4 w-4" /> No mandal access yet. Ask a mandal admin to add you.
        </p>
      )}
    </Card>
  );
}
