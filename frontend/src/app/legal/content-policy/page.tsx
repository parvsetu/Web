import type { Metadata } from 'next';
import Link from 'next/link';
import { Ban, CheckCircle2, FileCheck2, ShieldAlert } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { CONTENT_POLICY_RULE, DECLARATION_TEXT, NOT_ALLOWED, PERMISSIONS_LIST } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Content policy · Parvsetu',
  description: 'What events can be run on Parvsetu: no liquor, gambling or illegal activity, and all required permissions obtained.',
};

export default function ContentPolicyPage() {
  return (
    <PublicShell>
      <article className="flex flex-col gap-5 pb-6">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-5 text-white shadow-lg sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">Parvsetu</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Content policy</h1>
          <p className="mt-2 text-sm text-white/90 sm:text-base">Every mandal and every event is reviewed by the Parvsetu team before it is published.</p>
        </header>

        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-950"><ShieldAlert aria-hidden className="h-5 w-5 shrink-0 text-amber-600" /> The rule</h2>
          <p className="mt-2 leading-relaxed text-amber-950">{CONTENT_POLICY_RULE}</p>
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Ban aria-hidden className="h-5 w-5 shrink-0 text-red-600" /> Not allowed</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {NOT_ALLOWED.map((x) => (
              <li key={x} className="flex items-start gap-2 text-slate-700"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />{x}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 aria-hidden className="h-5 w-5 shrink-0 text-sky-600" /> Permissions you are responsible for</h2>
          <p className="mt-2 text-slate-700">Depending on your event and city, you may need permission from:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PERMISSIONS_LIST.map((p) => <span key={p} className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-900 ring-1 ring-sky-200">{p}</span>)}
          </div>
          <p className="mt-3 text-sm text-slate-600">Parvsetu does not issue these permissions. Keep copies ready — the team may ask for them during review.</p>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-emerald-600" /> The declaration you sign</h2>
          <blockquote className="mt-2 rounded-xl bg-emerald-50 p-3 text-slate-800 ring-1 ring-emerald-200">{DECLARATION_TEXT}</blockquote>
          <p className="mt-3 text-sm text-slate-600">
            It is required when registering a mandal and every time you submit an event. We record the version you accepted, when, and from which device.
            An event that breaks this policy is rejected, or unpublished at any time with a reason — its bookings, passes and gate scanning stop.
          </p>
        </section>

        <p className="text-sm text-slate-500">
          Questions? See <Link href="/faq#registration" className="font-semibold text-orange-700 underline">Help &amp; FAQ</Link>.
        </p>
      </article>
    </PublicShell>
  );
}
