import type { Metadata } from 'next';
import Link from 'next/link';
import { Ban, CheckCircle2, FileCheck2, ShieldAlert } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { getServerT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return { title: `${t('policy.title')} · Parvsetu`, description: t('policy.metaDescription') };
}

// The wording mirrors lib/legal.ts (what registrants agree to, in English); this page shows it in the visitor's language.
export default async function ContentPolicyPage() {
  const { t, tn } = await getServerT();
  const notAllowed = [t('policy.na1'), t('policy.na2'), t('policy.na3'), t('policy.na4')];
  const permissions = [t('policy.perm1'), t('policy.perm2'), t('policy.perm3'), t('policy.perm4'), t('policy.perm5'), t('policy.perm6')];
  const note = t('policy.translationNote');
  return (
    <PublicShell>
      <article className="flex flex-col gap-5 pb-6">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 p-5 text-white shadow-lg sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">Parvsetu</p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{t('policy.title')}</h1>
          <p className="mt-2 text-sm text-white/90 sm:text-base">{t('policy.intro')}</p>
        </header>

        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-950"><ShieldAlert aria-hidden className="h-5 w-5 shrink-0 text-amber-600" /> {t('policy.rule')}</h2>
          <p className="mt-2 leading-relaxed text-amber-950">{t('policy.ruleText')}</p>
        </section>

        <section className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Ban aria-hidden className="h-5 w-5 shrink-0 text-red-600" /> {t('policy.notAllowed')}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {notAllowed.map((x) => (
              <li key={x} className="flex items-start gap-2 text-slate-700"><span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />{x}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileCheck2 aria-hidden className="h-5 w-5 shrink-0 text-sky-600" /> {t('policy.permissions')}</h2>
          <p className="mt-2 text-slate-700">{t('policy.permissionsIntro')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {permissions.map((p) => <span key={p} className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-900 ring-1 ring-sky-200">{p}</span>)}
          </div>
          <p className="mt-3 text-sm text-slate-600">{t('policy.permissionsNote')}</p>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-emerald-600" /> {t('policy.declaration')}</h2>
          <blockquote className="mt-2 rounded-xl bg-emerald-50 p-3 text-slate-800 ring-1 ring-emerald-200">{t('policy.declarationText')}</blockquote>
          <p className="mt-3 text-sm text-slate-600">{t('policy.declarationNote')}</p>
        </section>

        <p className="text-sm text-slate-500">
          {tn('policy.questions', {
            link: (
              <Link href="/faq#registration" className="font-semibold text-orange-700 underline">
                {t('footer.helpFaq')}
              </Link>
            ),
          })}
        </p>
        {note && <p className="text-xs italic text-slate-500">{note}</p>}
      </article>
    </PublicShell>
  );
}
