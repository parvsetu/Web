/**
 * The donate page is a client component (it can't export this itself). An
 * empty list still opts it into caching, like the booking page.
 */
export function generateStaticParams() {
  return [];
}

export default function DonateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
