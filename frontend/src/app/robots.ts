import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-festival';

/** Public pages are indexable; the organiser app, checkout, passes and receipts are not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard', '/e/', '/org/', '/platform', '/profile', '/vendor', '/partner', '/agent', '/blogger', '/registration',
        '/pass/', '/pay/', '/r/', '/v/', '/book/my-passes', '/set-password', '/forgot-password', '/verify-email', '/awaiting',
        '/instagram/', '/launch', '/m/*/preview', '/*?*ref=',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
