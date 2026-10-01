/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The explore page moved to the main domain; old /book links (and their
  // ?city= etc.) land there. /book/<eventId> and /book/my-passes are unchanged.
  async redirects() {
    return [{ source: '/book', destination: '/', permanent: false }];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};
export default nextConfig;
