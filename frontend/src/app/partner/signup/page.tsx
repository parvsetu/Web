'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Building2, Handshake, MapPinned, QrCode, Sparkles, Ticket, UserRound, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { RegisterResult } from '@/lib/auth';
import { FestivalArt, LogoMark, Mandala, Toran } from '@/components/FestivalArt';
import { Alert, Button, LabeledInput } from '@/components/ui';

/** Public signup for brands (e.g. a jeweller) who want their logo printed on festival passes. */
export default function PartnerSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ brandName: '', contactName: '', email: '', mobile: '', password: '', gstin: '', websiteUrl: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs: Record<string, string> = {};
    if (form.brandName.trim().length < 2) errs.brandName = 'Enter your brand name.';
    if (form.contactName.trim().length < 2) errs.contactName = 'Enter the contact person’s name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email — we will send a code to activate the account.';
    if (form.mobile.replace(/\D/g, '').length < 10) errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (form.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(form.gstin.trim())) errs.gstin = 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5.';
    if (form.websiteUrl && !/^https?:\/\//i.test(form.websiteUrl.trim())) errs.websiteUrl = 'Website must start with https://';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body: Record<string, string> = {
        brandName: form.brandName.trim(), contactName: form.contactName.trim(), email: form.email.trim(), mobile: form.mobile.replace(/\s/g, ''), password: form.password,
      };
      if (form.gstin.trim()) body.gstin = form.gstin.trim();
      if (form.websiteUrl.trim()) body.websiteUrl = form.websiteUrl.trim();
      const res = await api.post<RegisterResult>('/partners/signup', body, { noAuthRedirect: true });
      router.replace(`/verify-email?email=${encodeURIComponent(res.email)}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#fffaf3] lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Pitch panel */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 px-5 pb-10 pt-safe text-white lg:min-h-[100dvh] lg:px-12">
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-24 -top-16 h-96 w-96 text-white/15" />
        <Mandala className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 text-white/10" />
        <div className="relative mx-auto flex max-w-xl flex-col gap-7 pt-8 lg:sticky lg:top-0 lg:pt-14">
          <Link href="/book" aria-label="Parvsetu home — explore events" className="flex w-fit items-center gap-2.5 rounded-2xl pr-2 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
            <LogoMark className="h-12 w-12 drop-shadow-lg" />
            <span className="text-2xl font-extrabold tracking-tight drop-shadow-sm">Parvsetu</span>
          </Link>
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              <Sparkles aria-hidden className="h-3.5 w-3.5" /> For brands
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight drop-shadow-sm sm:text-4xl">Put your brand in every festival-goer’s hand</h1>
            <p className="mt-2 max-w-lg text-base text-white/90 sm:text-lg">
              Your logo and offer printed on the entry passes of mandals and events you choose — Ganesh Utsav, Durga Puja, Navratri, melas and more.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: Ticket, title: 'On every pass', text: 'Logo + your message on each pass printed and shared.' },
              { icon: Wallet, title: 'Pay per pass', text: 'Prepaid wallet. Charged only for passes actually printed.' },
              { icon: MapPinned, title: 'You choose where', text: 'Pick mandals, cities and dates. Set a pass limit.' },
            ].map((b) => (
              <li key={b.title} className="flex items-start gap-3 rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/25 backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow">
                  <b.icon aria-hidden className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold">{b.title}</span>
                  <span className="block text-sm text-white/85">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-5 lg:flex">
            <PassPreview brand={form.brandName.trim()} />
            <ol className="flex flex-col gap-3 text-sm">
              {['Create your account', 'Get approved by Parvsetu', 'Recharge & pick mandals', 'Your brand goes live on passes'].map((step, i) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white font-bold text-orange-600 shadow">{i + 1}</span>
                  <span className="font-medium">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="px-4 py-8 sm:px-6 lg:flex lg:items-start lg:justify-center lg:py-14">
        <div className="mx-auto w-full max-w-lg rounded-3xl border border-orange-100 bg-white p-5 shadow-xl shadow-orange-900/10 sm:p-7 lg:-mt-0">
          <h2 className="text-2xl font-extrabold text-slate-900">Create your partner account</h2>
          <p className="mt-1 text-slate-600">Takes 2 minutes. No charge until you recharge your wallet.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-5" noValidate>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
                <Building2 aria-hidden className="h-4 w-4" /> Brand
              </legend>
              <LabeledInput label="Brand name" value={form.brandName} onChange={set('brandName')} error={errors.brandName} placeholder="e.g. Tanishq Jewellers" maxLength={120} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label="GSTIN (optional)" autoCapitalize="characters" value={form.gstin} onChange={set('gstin')} error={errors.gstin} maxLength={15} placeholder="27AAACT1234A1Z5" />
                <LabeledInput label="Website (optional)" type="url" value={form.websiteUrl} onChange={set('websiteUrl')} error={errors.websiteUrl} placeholder="https://" />
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-4 border-t border-orange-100 pt-5">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-orange-700">
                <UserRound aria-hidden className="h-4 w-4" /> Contact &amp; login
              </legend>
              <LabeledInput label="Contact person" autoComplete="name" value={form.contactName} onChange={set('contactName')} error={errors.contactName} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label="Email" type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} error={errors.email} hint="We send a code to activate it." />
                <LabeledInput label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="9876543210" />
              </div>
              <LabeledInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
            </fieldset>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" loading={busy}>
              {!busy && <Handshake aria-hidden className="h-6 w-6" />}
              Create partner account
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <BadgeCheck aria-hidden className="h-4 w-4 text-green-600" /> Every brand and campaign is reviewed by the Parvsetu team.
            </p>
            <p className="text-center text-sm text-slate-600">
              Already a partner?{' '}
              <Link href="/login" className="font-semibold text-orange-700 underline">
                Log in
              </Link>
              {' · '}
              <Link href="/book" className="font-semibold text-orange-700 underline">
                Explore events
              </Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}

/** Mini pass mock-up showing where the brand appears. */
function PassPreview({ brand }: { brand: string }) {
  return (
    <div aria-hidden className="w-52 shrink-0 rotate-[-4deg] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl ring-4 ring-white/40">
      <div className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-orange-500 px-3 py-2 text-white">
        <span className="h-7 w-7 rounded-full bg-white p-1"><FestivalArt type="GANESH_UTSAV" className="h-full w-full" /></span>
        <span className="text-xs font-bold leading-tight">Ganesh Utsav<br /><span className="font-medium opacity-90">Entry pass</span></span>
      </div>
      <div className="flex flex-col items-center gap-1 px-3 py-3">
        <QrCode className="h-20 w-20 text-slate-800" strokeWidth={1.25} />
        <span className="font-mono text-[11px] font-bold tracking-widest text-slate-500">GNU-2026-104</span>
      </div>
      <div className="border-t border-dashed border-slate-200 bg-amber-50 px-3 py-2 text-center">
        <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">In association with</span>
        <span className="block truncate text-sm font-extrabold text-orange-700">{brand || 'Your brand'}</span>
        <span className="block text-[10px] text-slate-600">10% off this festival week</span>
      </div>
    </div>
  );
}
