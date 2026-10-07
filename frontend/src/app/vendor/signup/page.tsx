'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, CalendarDays, CreditCard, MapPinned, Sparkles, Store, UserRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { RegisterResult } from '@/lib/auth';
import { LogoMark, Mandala, Toran } from '@/components/FestivalArt';
import { Alert, Button, LabeledInput, LabeledSelect } from '@/components/ui';
import { STALL_CATEGORIES, STALL_CATEGORY_LABEL } from '@/lib/stall-types';

/** Public signup for stall vendors (food, shopping, services, exhibitors) who book stalls at festivals. */
export default function VendorSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ businessName: '', contactName: '', email: '', mobile: '', password: '', gstin: '', category: '', city: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs: Record<string, string> = {};
    if (form.businessName.trim().length < 2) errs.businessName = 'Enter your business or stall name.';
    if (form.contactName.trim().length < 2) errs.contactName = 'Enter the contact person’s name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email — we will send a code to activate the account.';
    if (form.mobile.replace(/\D/g, '').length < 10) errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (form.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/i.test(form.gstin.trim())) errs.gstin = 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5.';
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
        businessName: form.businessName.trim(), contactName: form.contactName.trim(), email: form.email.trim(), mobile: form.mobile.replace(/\s/g, ''), password: form.password,
      };
      if (form.gstin.trim()) body.gstin = form.gstin.trim();
      if (form.category) body.category = form.category;
      if (form.city.trim()) body.city = form.city.trim();
      const res = await api.post<RegisterResult>('/vendors/signup', body, { noAuthRedirect: true });
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
      <section className="relative overflow-hidden bg-gradient-to-br from-teal-500 via-emerald-600 to-cyan-700 px-5 pb-10 pt-safe text-white lg:min-h-[100dvh] lg:px-12">
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-24 -top-16 h-96 w-96 text-white/15" />
        <Mandala className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 text-white/10" />
        <div className="relative mx-auto flex max-w-xl flex-col gap-7 pt-8 lg:sticky lg:top-0 lg:pt-14">
          <Link href="/" aria-label="Parvsetu home — explore events" className="flex w-fit items-center gap-2.5 rounded-2xl pr-2 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
            <LogoMark className="h-12 w-12 drop-shadow-lg" />
            <span className="text-2xl font-extrabold tracking-tight drop-shadow-sm">Parvsetu</span>
          </Link>
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              <Sparkles aria-hidden className="h-3.5 w-3.5" /> For stall vendors
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight drop-shadow-sm sm:text-4xl">Book your stall at India’s festivals — online</h1>
            <p className="mt-2 max-w-lg text-base text-white/90 sm:text-lg">
              Food, shopping, services or an exhibition booth — find festivals and melas near you, see how many stalls are left and book in minutes.
            </p>
          </div>

          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: MapPinned, title: 'Find festivals', text: 'Ganesh Utsav, Durga Puja, Navratri, melas and exhibitions near you.' },
              { icon: CalendarDays, title: 'Live availability', text: 'See stall types, sizes, prices and how many are left.' },
              { icon: CreditCard, title: 'Pay online', text: 'Your stall is confirmed the moment you pay. Invoice included.' },
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
            <ol className="flex flex-col gap-3 text-sm">
              {['Create your account', 'Pick a festival and stall type', 'Pay online', 'The mandal assigns your stall number'].map((step, i) => (
                <li key={step} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white font-bold text-teal-700 shadow">{i + 1}</span>
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
          <h2 className="text-2xl font-extrabold text-slate-900">Create your vendor account</h2>
          <p className="mt-1 text-slate-600">Takes 2 minutes. You only pay when you book a stall.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-5" noValidate>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
                <Store aria-hidden className="h-4 w-4" /> Business
              </legend>
              <LabeledInput label="Business / stall name" value={form.businessName} onChange={set('businessName')} error={errors.businessName} placeholder="e.g. Shree Chaat Corner" maxLength={120} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledSelect label="What you sell (optional)" value={form.category} onChange={set('category')}>
                  <option value="">Choose…</option>
                  {STALL_CATEGORIES.map((c) => <option key={c} value={c}>{STALL_CATEGORY_LABEL[c]}</option>)}
                </LabeledSelect>
                <LabeledInput label="City (optional)" value={form.city} onChange={set('city')} maxLength={80} placeholder="e.g. Pune" />
              </div>
              <LabeledInput label="GSTIN (optional)" autoCapitalize="characters" value={form.gstin} onChange={set('gstin')} error={errors.gstin} maxLength={15} placeholder="27AAACT1234A1Z5" />
            </fieldset>
            <fieldset className="flex flex-col gap-4 border-t border-orange-100 pt-5">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-teal-700">
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
              {!busy && <Store aria-hidden className="h-6 w-6" />}
              Create vendor account
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <BadgeCheck aria-hidden className="h-4 w-4 text-green-600" /> We email you a code to activate the account.
            </p>
            <p className="text-center text-sm text-slate-600">
              Already have a vendor account?{' '}
              <Link href="/login" className="font-semibold text-teal-700 underline">
                Log in
              </Link>
              {' · '}
              <Link href="/" className="font-semibold text-teal-700 underline">
                Explore events
              </Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
