import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { SeoAbove, SeoBelow } from '@/components/explore/SeoBlocks';
import { getServerT, pageLang } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/seo';
import { cityFromSlug, getSeoPage } from '@/lib/seo-content';

type Props = { params: { lang: string; city: string } };

export const revalidate = 300;

/** /city/<slug>: the explore page for one city, with the super admin's SEO text. */
async function load(params: Props['params']) {
  const slug = decodeURIComponent(params.city).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  const lang = pageLang(params);
  const [page, t] = await Promise.all([getSeoPage('CITY', slug, lang), getServerT(params)]);
  const name = page?.name || (await cityFromSlug(slug));
  return { slug, page, t, name, title: page?.title || t.t('seo.cityTitle', { city: t.city(name) }) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, page, t, name, title } = await load(params);
  const path = `/city/${slug}`;
  const description = page?.metaDescription || t.t('seo.cityDescription', { city: t.city(name) });
  return {
    title: { absolute: `${title} · Parvsetu` },
    description,
    alternates: { canonical: path, languages: languageAlternates(path) },
    openGraph: { title, description, url: path },
  };
}

export default async function CityPage({ params }: Props) {
  const { page, name, title } = await load(params);
  return <ExplorePage fixedCity={name} above={<SeoAbove title={title} text={page?.aboveText} />} below={<SeoBelow text={page?.belowText} />} />;
}
