import type { Metadata } from 'next';
import { PublicShell } from '@/components/booking/PublicShell';
import { siteUrl } from '@/lib/public-festival';
import { getFaq } from '@/lib/i18n/faq';
import { getServerT, pageLang } from '@/lib/i18n/server';
import { FaqBrowser } from './FaqBrowser';

type LangParams = { params: { lang: string } };

export async function generateMetadata({ params }: LangParams): Promise<Metadata> {
  const { t } = await getServerT(params);
  return {
    metadataBase: new URL(siteUrl()),
    title: `${t('faq.title')} · Parvsetu`,
    description: t('faq.metaDescription'),
    alternates: { canonical: '/faq' },
  };
}

export default async function FaqPage({ params }: LangParams) {
  const faq = await getFaq(pageLang(params));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.flatMap((s) => s.items).map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a.join(' ') } })),
  };
  return (
    <PublicShell wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <FaqBrowser faq={faq} />
    </PublicShell>
  );
}
