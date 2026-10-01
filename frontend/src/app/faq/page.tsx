import type { Metadata } from 'next';
import { PublicShell } from '@/components/booking/PublicShell';
import { FAQ } from '@/lib/faq';
import { siteUrl } from '@/lib/public-festival';
import { FaqBrowser } from './FaqBrowser';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Help & FAQ · Parvsetu',
  description: 'How mandals use Parvsetu: festivals, QR passes, gate scanning, volunteers, online booking, GST, donations, credit and more.',
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.flatMap((s) => s.items).map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a.join(' ') } })),
  };
  return (
    <PublicShell wide>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <FaqBrowser />
    </PublicShell>
  );
}
