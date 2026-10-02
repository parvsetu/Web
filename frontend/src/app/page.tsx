import type { Metadata } from 'next';
import BookPage from './book/page';
import { getServerT } from '@/lib/i18n/server';

/**
 * The main domain is the public explore page (festivals, melas, exhibitions
 * near you). /book stays as an alias so existing links and printed QRs keep
 * working. The signed-in organiser home lives at /dashboard.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getServerT();
  return {
    title: { absolute: t('meta.homeTitle') },
    description: t('meta.homeDescription'),
    alternates: { canonical: '/' },
    openGraph: {
      title: t('meta.homeTitle'),
      description: t('meta.homeOgDescription'),
      url: '/',
      locale: `${lang}_IN`,
    },
  };
}

export default function HomePage() {
  return <BookPage />;
}
