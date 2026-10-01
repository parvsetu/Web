/** Public web origin for links in emails / share links (PUBLIC_WEB_URL, else the first CORS origin). */
export function siteUrl() {
  return (process.env.PUBLIC_WEB_URL ?? (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0]).trim().replace(/\/+$/, '').replace('*', '');
}
