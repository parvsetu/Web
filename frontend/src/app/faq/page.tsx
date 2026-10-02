import type { Metadata } from 'next';
import { PublicShell } from '@/components/booking/PublicShell';
import { siteUrl } from '@/lib/public-festival';
import { getFaq } from '@/lib/i18n/faq';
import { getRequestLang, getServerT } from '@/lib/i18n/server';
import { FaqBrowser } from './FaqBrowser';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    metadataBase: new URL(siteUrl()),
    title: `${t('faq.title')} · Parvsetu`,
    description: t('faq.metaDescription'),
    alternates: { canonical: '/faq' },
  };
}

export default async function FaqPage() {
  const faq = await getFaq(getRequestLang());
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
