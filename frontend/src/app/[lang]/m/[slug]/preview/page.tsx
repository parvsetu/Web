import type { Metadata } from 'next';
import { getLandingPage } from '@/lib/landing';
import LandingPage from '../page';
import { LandingPreview } from '../preview';

type Props = { params: { lang: string; slug: string } };

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** `/m/<slug>?preview=1` — the middleware routes it here (see ../page.tsx). */
export default async function LandingPreviewPage({ params }: Props) {
  const p = await getLandingPage(params.slug);
  if (p) return <LandingPage params={params} />;
  return <LandingPreview slug={params.slug} />;
}
