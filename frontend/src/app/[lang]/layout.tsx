import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { Providers } from '../providers';
import { DEFAULT_LANG, isLang } from '@/lib/i18n/config';
import { indicFontVars } from '@/lib/i18n/fonts';
import { loadMessages } from '@/lib/i18n/locales';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://parvsetu-web.vercel.app').replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Parvsetu — Festival passes & mandal management', template: '%s' },
  description: 'Book QR entry passes for festivals, melas and exhibitions near you — and run your mandal’s festivals: passes, gate scanning, volunteers, donations and reports.',
  applicationName: 'Parvsetu',
  openGraph: {
    type: 'website',
    siteName: 'Parvsetu',
    locale: 'en_IN',
    title: 'Parvsetu — Festival passes & mandal management',
    description: 'Discover festivals near you and book QR entry passes. Mandals run passes, gate scanning, volunteers and donations on Parvsetu.',
    images: [{ url: '/icons/diya-512.png', width: 512, height: 512, alt: 'Parvsetu' }],
  },
  twitter: { card: 'summary', title: 'Parvsetu', description: 'Festival passes & mandal management' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Parvsetu', statusBarStyle: 'default' },
  // New file names (not apple-touch-icon.png): iPhones and the old service worker cache icons by URL,
  // so the first, broken icons kept showing as a letter "P" until the address changed.
  // favicon.ico (16/32/48) and icon.svg come from src/app; the PNGs are what Google's search results
  // and Android pick (multiples of 48 px).
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/diya-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/icons/diya-96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/diya-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/diya-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ea580c',
};

/**
 * Every route lives under [lang], which the middleware fills in from the
 * visitor's language (cookie / ?lang=) on public pages and as `en` on the
 * organiser app — the URL itself never shows it. Reading the language from
 * the path instead of cookies() keeps pages static, so Vercel serves them
 * from its cache. English is built ahead; other languages on first visit.
 */
export function generateStaticParams() {
  return [{ lang: DEFAULT_LANG }];
}

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: { lang: string } }) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const messages = await loadMessages(lang);
  return (
    <html lang={lang} className={indicFontVars}>
      <body className="min-h-[100dvh] font-sans antialiased">
        <Providers lang={lang} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
