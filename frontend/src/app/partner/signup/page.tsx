'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, Handshake, Ticket, Wallet } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { RegisterResult } from '@/lib/auth';
import { AuthCard } from '@/components/AuthCard';
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
    <AuthCard title="Become a promotional partner" subtitle="Put your brand on festival passes across mandals.">
      <ul className="mb-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        {[
          { icon: Ticket, text: 'Your logo & offer on every pass printed', cls: 'from-amber-50 to-orange-50 text-orange-900' },
          { icon: Wallet, text: 'Prepaid wallet — pay only per pass printed', cls: 'from-emerald-50 to-teal-50 text-emerald-900' },
          { icon: BadgeCheck, text: 'Reviewed and approved by the Parvsetu team', cls: 'from-violet-50 to-fuchsia-50 text-violet-900' },
        ].map((b) => (
          <li key={b.text} className={`flex items-center gap-2 rounded-xl bg-gradient-to-br p-2.5 font-medium ${b.cls}`}>
            <b.icon aria-hidden className="h-5 w-5 shrink-0" /> {b.text}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <LabeledInput label="Brand name" value={form.brandName} onChange={set('brandName')} error={errors.brandName} placeholder="e.g. Tanishq Jewellers" maxLength={120} />
        <LabeledInput label="Contact person" autoComplete="name" value={form.contactName} onChange={set('contactName')} error={errors.contactName} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="Email" type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} error={errors.email} hint="We send a 6-digit code to activate the account." />
          <LabeledInput label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="9876543210" />
        </div>
        <LabeledInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LabeledInput label="GSTIN (optional)" autoCapitalize="characters" value={form.gstin} onChange={set('gstin')} error={errors.gstin} maxLength={15} />
          <LabeledInput label="Website (optional)" type="url" value={form.websiteUrl} onChange={set('websiteUrl')} error={errors.websiteUrl} placeholder="https://" />
        </div>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={busy}>
          {!busy && <Handshake aria-hidden className="h-6 w-6" />}
          Create partner account
        </Button>
        <p className="text-center text-sm text-slate-600">
          Already a partner?{' '}
          <Link href="/login" className="font-semibold text-brand-700 underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
