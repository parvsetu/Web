import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE, LANG_PARAM, PATH_HEADER, isLang } from '@/lib/i18n/config';

/**
 * `?lang=hi` on any URL picks the language: the cookie is set on the response
 * (remembered) and on this very request, so the page already renders in it.
 * Also forwards the path so the root layout can set `<html lang>`.
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set(PATH_HEADER, req.nextUrl.pathname);
  const param = req.nextUrl.searchParams.get(LANG_PARAM);
  const lang = isLang(param) ? param : null;
  if (lang) {
    req.cookies.set(LANG_COOKIE, lang);
    headers.set('cookie', req.cookies.toString());
  }
  const res = NextResponse.next({ request: { headers } });
  if (lang) res.cookies.set(LANG_COOKIE, lang, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  return res;
}

export const config = {
  matcher: ['/((?!_next/|api/|icons/|art/|sw\\.js|manifest\\.webmanifest|favicon|icon\\.svg|robots\\.txt|sitemap).*)'],
};
