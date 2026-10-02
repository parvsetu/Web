import type { Metadata, Viewport } from 'next';
import './globals.css';
import { headers } from 'next/headers';
import { Providers } from './providers';
import { PATH_HEADER, isPublicPath } from '@/lib/i18n/config';
import { indicFontVars } from '@/lib/i18n/fonts';
import { loadMessages } from '@/lib/i18n/locales';
import { getRequestLang } from '@/lib/i18n/server';

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
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Parvsetu' }],
  },
  twitter: { card: 'summary', title: 'Parvsetu', description: 'Festival passes & mandal management' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Parvsetu', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ea580c',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The visitor's language (cookie / ?lang=). Public pages follow it; the
  // organiser app stays English for now (see lib/i18n/config.ts).
  const lang = getRequestLang();
  const messages = await loadMessages(lang);
  const path = headers().get(PATH_HEADER);
  return (
    <html lang={isPublicPath(path) ? lang : 'en'} className={indicFontVars}>
      <body className="min-h-[100dvh] font-sans antialiased">
        <Providers lang={lang} messages={messages}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
