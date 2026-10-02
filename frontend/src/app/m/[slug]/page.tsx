import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicShell } from '@/components/booking/PublicShell';
import { LandingView } from '@/components/landing/LandingView';
import { getLandingPage } from '@/lib/landing';
import { siteUrl } from '@/lib/public-festival';
import { getServerT } from '@/lib/i18n/server';
import { LandingPreview } from './preview';

type Props = { params: { slug: string }; searchParams: { preview?: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getLandingPage(params.slug);
  const { t } = await getServerT();
  if (!p) return { title: `${t('landing.unavailable')} · Parvsetu`, robots: { index: false } };
  const place = [p.organization.city, p.organization.state].filter(Boolean).join(', ');
  const description = p.headline ?? t('landing.metaDefault', { org: `${p.organization.name}${place ? ` · ${place}` : ''}` });
  return {
    metadataBase: new URL(siteUrl()),
    title: `${p.organization.name} · Parvsetu`,
    description,
    // Share image: ./opengraph-image (banner + logo, or the theme gradient).
    openGraph: { title: p.organization.name, description, type: 'website', url: `/m/${p.slug}`, siteName: 'Parvsetu' },
    twitter: { card: 'summary_large_image', title: p.organization.name, description },
  };
}

/** Paid mandal landing page. Only served while paid & enabled; `?preview=1` lets the mandal's admins see it before that. */
export default async function LandingPage({ params, searchParams }: Props) {
  const p = await getLandingPage(params.slug);
  if (!p) {
    if (searchParams.preview) return <LandingPreview slug={params.slug} />;
    const { t } = await getServerT();
    return (
      <PublicShell>
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-orange-200 bg-white px-4 py-14 text-center">
          <p className="text-4xl">🪔</p>
          <h1 className="text-xl font-extrabold">{t('landing.unavailable')}</h1>
          <p className="max-w-sm text-slate-600">{t('landing.unavailableHint')}</p>
          <Link href="/" className="mt-2 inline-flex min-h-[48px] items-center rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-bold text-white">{t('landing.explore')}</Link>
        </div>
      </PublicShell>
    );
  }
  return (
    <PublicShell wide>
      <LandingView p={p} url={`${siteUrl()}/m/${p.slug}`} />
    </PublicShell>
  );
}
