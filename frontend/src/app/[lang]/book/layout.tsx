import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book festival passes · Parvsetu',
  description: 'Browse festivals near you, pick a day and time slot, and get a QR entry pass on your phone.',
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
