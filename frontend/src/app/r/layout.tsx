import type { Metadata } from 'next';

// Receipt URLs carry a secret key — keep them out of search engines and referrers.
export const metadata: Metadata = {
  title: 'Donation receipt · Parvsetu',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return children;
}
