/**
 * The booking page is a client component (it can't export this itself). An
 * empty list still opts it into caching: each event's page shell is rendered
 * once and then served from Vercel's cache instead of on every visit.
 */
export function generateStaticParams() {
  return [];
}

export default function BookEventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
