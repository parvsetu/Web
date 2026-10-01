import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Parvsetu',
  description: 'Festival and mandal management — entry tokens, volunteers, donations and reports.',
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
