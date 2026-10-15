import type { Metadata } from 'next';

// Pass URLs carry the buyer's access key — keep them out of search engines.
export const metadata: Metadata = {
  title: 'Your festival pass · Parvsetu',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PassLayout({ children }: { children: React.ReactNode }) {
  return children;
}
