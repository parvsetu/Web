import type { Metadata } from 'next';

// Checkout URLs carry the buyer's access key — keep them out of search engines.
export const metadata: Metadata = {
  title: 'Checkout · Parvsetu',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
