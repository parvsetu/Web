import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
