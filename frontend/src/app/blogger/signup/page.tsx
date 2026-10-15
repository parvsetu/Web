'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BadgeCheck, BadgeIndianRupee, Link2, Megaphone, PartyPopper, Sparkles, UserRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { RegisterResult } from '@/lib/auth';
import { LogoMark, Mandala, Toran } from '@/components/FestivalArt';
import { FestivalPicker } from '@/components/blogger/FestivalPicker';
import { Alert, Button, Field, LabeledInput, Textarea } from '@/components/ui';

/** Public signup for bloggers / influencers who promote festivals and earn per paid booking. */
export default function BloggerSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', mobile: '', password: '', city: '', youtubeUrl: '', instagramHandle: '', blogUrl: '', audience: '', bio: '' });
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate() {
    const errs: Record<string, string> = {};
    const url = (v: string) => !v.trim() || /^https?:\/\/\S+\.\S+/.test(v.trim());
    if (form.name.trim().length < 2) errs.name = 'Enter your name or channel name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errs.email = 'Enter a valid email — we send a code to activate the account.';
    if (form.mobile.replace(/\D/g, '').length < 10) errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    if (!url(form.youtubeUrl)) errs.youtubeUrl = 'Paste the full link, starting with https://';
    if (!url(form.blogUrl)) errs.blogUrl = 'Paste the full link, starting with https://';
    if (form.instagramHandle.trim() && !/^@?[A-Za-z0-9._]{1,30}$/.test(form.instagramHandle.trim())) errs.instagramHandle = 'Looks like @yourname';
    if (!form.youtubeUrl.trim() && !form.instagramHandle.trim() && !form.blogUrl.trim()) errs.channels = 'Add at least one channel — YouTube, Instagram or a blog.';
    if (eventIds.length === 0) errs.events = 'Pick at least one festival you want to promote.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), email: form.email.trim(), mobile: form.mobile.replace(/\s/g, ''), password: form.password, eventIds };
      for (const k of ['city', 'youtubeUrl', 'instagramHandle', 'blogUrl', 'audience', 'bio'] as const) if (form[k].trim()) body[k] = form[k].trim();
      const res = await api.post<RegisterResult>('/bloggers/signup', body, { noAuthRedirect: true });
      router.replace(`/verify-email?email=${encodeURIComponent(res.email)}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#fffaf3] lg:grid lg:grid-cols-[1.05fr_1fr]">
      <section className="relative overflow-hidden bg-gradient-to-br from-fuchsia-500 via-pink-600 to-rose-600 px-5 pb-10 pt-safe text-white lg:min-h-[100dvh] lg:px-12">
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-24 -top-16 h-96 w-96 text-white/15" />
        <div className="relative mx-auto flex max-w-xl flex-col gap-7 pt-8 lg:sticky lg:top-0 lg:pt-14">
          <Link href="/" aria-label="Parvsetu home — explore events" className="flex w-fit items-center gap-2.5 rounded-2xl pr-2 transition hover:scale-[1.02] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/60">
            <LogoMark className="h-12 w-12 drop-shadow-lg" />
            <span className="text-2xl font-extrabold tracking-tight drop-shadow-sm">Parvsetu</span>
          </Link>
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em]">
              <Sparkles aria-hidden className="h-3.5 w-3.5" /> For bloggers &amp; influencers
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight drop-shadow-sm sm:text-4xl">Promote festivals. Earn on every booking.</h1>
            <p className="mt-2 max-w-lg text-base text-white/90 sm:text-lg">
              YouTube, Instagram or a blog — share your own link for each festival and earn a commission whenever someone books a pass through it.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: Megaphone, title: 'Pick festivals', text: 'Choose the festivals and melas your audience will love.' },
              { icon: Link2, title: 'Your own link', text: 'A referral code and link for every festival you promote.' },
              { icon: BadgeIndianRupee, title: 'Earn per booking', text: 'Commission is credited once the visitor’s payment succeeds.' },
            ].map((b) => (
              <li key={b.title} className="flex items-start gap-3 rounded-2xl bg-white/15 p-3.5 ring-1 ring-white/25 backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-pink-600 shadow"><b.icon aria-hidden className="h-5 w-5" /></span>
                <span>
                  <span className="block font-bold">{b.title}</span>
                  <span className="block text-sm text-white/85">{b.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:flex lg:items-start lg:justify-center lg:py-14">
        <div className="mx-auto w-full max-w-lg rounded-3xl border border-pink-100 bg-white p-5 shadow-xl shadow-pink-900/10 sm:p-7">
          <h2 className="text-2xl font-extrabold text-slate-900">Join as a blogger</h2>
          <p className="mt-1 text-slate-600">The Parvsetu team reviews every application.</p>
          <form onSubmit={submit} className="mt-6 flex flex-col gap-5" noValidate>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-pink-700"><PartyPopper aria-hidden className="h-4 w-4" /> Your channels</legend>
              <LabeledInput label="YouTube channel link" type="url" inputMode="url" value={form.youtubeUrl} onChange={set('youtubeUrl')} error={errors.youtubeUrl} placeholder="https://youtube.com/@yourchannel" maxLength={300} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label="Instagram handle" autoCapitalize="none" value={form.instagramHandle} onChange={set('instagramHandle')} error={errors.instagramHandle} placeholder="@yourname" maxLength={31} />
                <LabeledInput label="Blog / website" type="url" inputMode="url" value={form.blogUrl} onChange={set('blogUrl')} error={errors.blogUrl} placeholder="https://…" maxLength={300} />
              </div>
              {errors.channels && <p className="-mt-2 text-sm font-medium text-red-700">{errors.channels}</p>}
              <LabeledInput label="Audience (optional)" value={form.audience} onChange={set('audience')} placeholder="e.g. 45k Instagram followers, mostly Pune" maxLength={120} />
              <Field label="About you (optional)">
                <Textarea value={form.bio} onChange={set('bio')} maxLength={1000} rows={3} placeholder="What you create and who watches it" />
              </Field>
            </fieldset>
            <fieldset className="flex flex-col gap-3 border-t border-pink-100 pt-5">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-pink-700"><Megaphone aria-hidden className="h-4 w-4" /> Festivals to promote</legend>
              <FestivalPicker selected={eventIds} onChange={setEventIds} />
              {errors.events && <p className="text-sm font-medium text-red-700">{errors.events}</p>}
            </fieldset>
            <fieldset className="flex flex-col gap-4 border-t border-pink-100 pt-5">
              <legend className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-pink-700"><UserRound aria-hidden className="h-4 w-4" /> You &amp; your login</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label="Name" autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} maxLength={100} />
                <LabeledInput label="City (optional)" value={form.city} onChange={set('city')} maxLength={80} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <LabeledInput label="Email" type="email" autoComplete="email" autoCapitalize="none" value={form.email} onChange={set('email')} error={errors.email} hint="We send a code to activate it." />
                <LabeledInput label="Mobile number" type="tel" inputMode="numeric" autoComplete="tel" value={form.mobile} onChange={set('mobile')} error={errors.mobile} placeholder="9876543210" />
              </div>
              <LabeledInput label="Password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters" />
            </fieldset>
            {error && <Alert>{error}</Alert>}
            <Button type="submit" size="lg" loading={busy}>
              {!busy && <Megaphone aria-hidden className="h-6 w-6" />}
              Apply as a blogger
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500"><BadgeCheck aria-hidden className="h-4 w-4 text-green-600" /> Bookings with your own mobile number or email don’t earn commission.</p>
            <p className="text-center text-sm text-slate-600">
              Already joined? <Link href="/login" className="font-semibold text-pink-700 underline">Log in</Link>
              {' · '}
              <Link href="/" className="font-semibold text-pink-700 underline">Explore events</Link>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
