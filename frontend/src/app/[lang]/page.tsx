import type { Metadata } from 'next';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { SeoAbove, SeoBelow } from '@/components/explore/SeoBlocks';
import { getServerT, pageLang } from '@/lib/i18n/server';
import { getSeoPage } from '@/lib/seo-content';

type LangParams = { params: { lang: string } };

/**
 * The main domain is the public explore page (festivals, melas, exhibitions
 * near you). /book stays as an alias so existing links and printed QRs keep
 * working. The signed-in organiser home lives at /dashboard.
 */
export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const [{ t, lang }, seo] = await Promise.all([getServerT(params), getSeoPage('HOME', '', pageLang(params))]);
  return {
    title: { absolute: seo?.title || t('meta.homeTitle') },
    description: seo?.metaDescription || t('meta.homeDescription'),
    alternates: { canonical: '/' },
    openGraph: {
      title: t('meta.homeTitle'),
      description: t('meta.homeOgDescription'),
      url: '/',
      locale: `${lang}_IN`,
    },
  };
}

export default async function HomePage({ params }: LangParams) {
  const seo = await getSeoPage('HOME', '', pageLang(params));
  return <ExplorePage above={<SeoAbove text={seo?.aboveText} />} below={<SeoBelow text={seo?.belowText} />} />;
}
