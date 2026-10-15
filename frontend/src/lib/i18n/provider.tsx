'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { DEFAULT_LANG, LANG_COOKIE, LANG_PARAM, LANG_STORAGE_KEY, isLang, isPublicPath, type Lang } from './config';
import { makeTranslator, type Messages, type Translator } from './core';
import { loadMessages } from './locales';

export interface I18n extends Translator {
  /** The visitor's chosen language (even on pages that are English-only for now). */
  preferred: Lang;
  setLang: (lang: Lang) => void;
}

const Ctx = createContext<I18n | null>(null);

function readStored(): Lang | null {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function readCookie(): Lang | null {
  try {
    const v = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${LANG_COOKIE}=`))?.slice(LANG_COOKIE.length + 1);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

/** `/hi/faq` → `/faq`: the server may see the internal app/[lang] path. */
function withoutLang(pathname: string | null): string | null {
  if (!pathname) return pathname;
  const first = pathname.split('/')[1];
  return isLang(first) ? pathname.slice(first.length + 1) || '/' : pathname;
}

function persist(lang: Lang) {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode — the cookie still carries it */
  }
  try {
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  } catch {
    /* cookies blocked — this tab still switches */
  }
}

/**
 * Holds the visitor's language. The server passes the page's language (the
 * app/[lang] segment) and its dictionary, so the first render already matches
 * (no hydration flash). On organiser pages that is always `en`, so the
 * visitor's real choice is picked up from the cookie after mount.
 * Only public pages (see isPublicPath) follow it; the organiser app stays English.
 */
export function LanguageProvider({ initialLang, initialMessages, children }: { initialLang: Lang; initialMessages: Messages | null; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [dicts, setDicts] = useState<Partial<Record<Lang, Messages>>>(() => (initialMessages && initialLang !== 'en' ? { [initialLang]: initialMessages } : {}));
  const loading = useRef(new Set<Lang>());

  const effective: Lang = isPublicPath(withoutLang(pathname)) ? lang : 'en';

  const ensure = useCallback(async (l: Lang) => {
    if (l === 'en' || loading.current.has(l)) return;
    loading.current.add(l);
    const m = await loadMessages(l);
    if (m) setDicts((d) => ({ ...d, [l]: m }));
    loading.current.delete(l);
  }, []);

  useEffect(() => {
    if (effective !== 'en' && !dicts[effective]) void ensure(effective);
  }, [effective, dicts, ensure]);

  useEffect(() => {
    document.documentElement.lang = effective;
  }, [effective]);

  const setLang = useCallback(
    (l: Lang) => {
      persist(l);
      void ensure(l);
      setLangState(l);
      // A ?lang= in the URL would switch it straight back (middleware) — navigate
      // to the same page without it. Otherwise just re-render the server parts
      // (festival, mandal, FAQ, policy pages) in the new language.
      let url: URL | null = null;
      try {
        url = new URL(window.location.href);
      } catch {
        /* ignore */
      }
      if (url?.searchParams.has(LANG_PARAM)) {
        url.searchParams.delete(LANG_PARAM);
        router.replace(url.pathname + url.search + url.hash, { scroll: false });
      } else router.refresh();
    },
    [ensure, router],
  );

  // First visit on this browser with a stored choice but no cookie (e.g. cookie
  // cleared): restore it. Otherwise follow the cookie (an organiser page was
  // rendered in `en` whatever it says) and keep localStorage in step with it.
  useEffect(() => {
    const stored = readStored();
    const cookie = readCookie();
    if (!cookie && stored && stored !== initialLang) setLang(stored);
    else if (cookie) {
      if (cookie !== initialLang) setLangState(cookie);
      if (stored !== cookie) persist(cookie);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<I18n>(() => {
    const tr = makeTranslator(effective, effective === 'en' ? null : dicts[effective] ?? null);
    return { ...tr, preferred: lang, setLang };
  }, [effective, dicts, lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const fallback: I18n = { ...makeTranslator(DEFAULT_LANG, null), preferred: DEFAULT_LANG, setLang: () => undefined };

/** `const { t, tp, locale } = useT();` — English outside the provider. */
export function useT(): I18n {
  return useContext(Ctx) ?? fallback;
}
