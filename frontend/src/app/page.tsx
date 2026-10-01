import type { Metadata } from 'next';
import BookPage from './book/page';

/**
 * The main domain is the public explore page (festivals, melas, exhibitions
 * near you). /book stays as an alias so existing links and printed QRs keep
 * working. The signed-in organiser home lives at /dashboard.
 */
export const metadata: Metadata = {
  title: { absolute: 'Parvsetu — Festival passes & events near you' },
  description: 'Discover Ganesh Utsav, Durga Puja, Navratri garba, melas, kathas and exhibitions near you. Book a time slot and get a QR entry pass on your phone.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Parvsetu — Festival passes & events near you',
    description: 'Discover festivals, melas and exhibitions across India and book QR entry passes in seconds.',
    url: '/',
  },
};

export default function HomePage() {
  return <BookPage />;
}
