import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExplorePage } from '@/components/explore/ExplorePage';
import { SeoAbove, SeoBelow } from '@/components/explore/SeoBlocks';
import { CATEGORIES, catLabel } from '@/lib/explore';
import { getServerT, pageLang } from '@/lib/i18n/server';
import { languageAlternates } from '@/lib/seo';
import { getSeoPage } from '@/lib/seo-content';

type Props = { params: { lang: string; cat: string } };

export const revalidate = 300;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ cat: c.key }));
}

/** /category/<key>: the explore page for one category, with the super admin's SEO text. */
async function load(params: Props['params']) {
  const c = CATEGORIES.find((x) => x.key === params.cat);
  if (!c) notFound();
  const [page, t] = await Promise.all([getSeoPage('CATEGORY', c.key, pageLang(params)), getServerT(params)]);
  const label = catLabel(t.t, c);
  return { c, page, t, label, title: page?.title || t.t('seo.categoryTitle', { category: label }) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { c, page, t, label, title } = await load(params);
  const path = `/category/${c.key}`;
  const description = page?.metaDescription || t.t('seo.categoryDescription', { category: label });
  return {
    title: { absolute: `${title} · Parvsetu` },
    description,
    alternates: { canonical: path, languages: languageAlternates(path) },
    openGraph: { title, description, url: path },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { c, page, title } = await load(params);
  return <ExplorePage fixedCat={c.key} above={<SeoAbove title={title} text={page?.aboveText} />} below={<SeoBelow text={page?.belowText} />} />;
}
