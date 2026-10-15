import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_LANG, LANG_COOKIE, LANG_PARAM, isLang, isPublicPath } from '@/lib/i18n/config';

/**
 * Every page lives under app/[lang]/. This picks the language and rewrites
 * `/faq` to `/hi/faq` internally — the browser URL never changes:
 *  - public pages (isPublicPath) follow `?lang=` (also remembered in the
 *    cookie), else the cookie, else English;
 *  - the organiser app is always `en`.
 * Pages read the language from the path, not cookies(), so each language's
 * page is cached by Vercel on its own.
 */
export function middleware(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;

  // Already prefixed (e.g. the /hi/f/<id>/opengraph-image URLs Next writes into metadata).
  const first = pathname.split('/')[1];
  if (isLang(first)) return NextResponse.next();

  const param = searchParams.get(LANG_PARAM);
  const fromParam = isLang(param) ? param : null;
  const cookie = req.cookies.get(LANG_COOKIE)?.value;
  const lang = !isPublicPath(pathname) ? DEFAULT_LANG : fromParam ?? (isLang(cookie) ? cookie : DEFAULT_LANG);

  // A mandal's admins preview an unpublished landing page with ?preview=1;
  // that goes to its own uncached route so /m/<slug> itself stays cached.
  let path = pathname === '/' ? '' : pathname;
  if (/^\/m\/[^/]+\/?$/.test(pathname) && searchParams.get('preview')) path = `${pathname.replace(/\/$/, '')}/preview`;

  const res = NextResponse.rewrite(new URL(`/${lang}${path}${search}`, req.url));
  if (fromParam) res.cookies.set(LANG_COOKIE, fromParam, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}

export const config = {
  matcher: ['/((?!_next/|api/|icons/|art/|sw\\.js|manifest\\.webmanifest|favicon|icon\\.svg|apple-touch-icon|robots\\.txt|sitemap).*)'],
};
