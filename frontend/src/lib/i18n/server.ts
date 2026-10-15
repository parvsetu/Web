import { DEFAULT_LANG, isLang, type Lang } from './config';
import { makeTranslator, type Translator } from './core';
import { loadMessages } from './locales';

/**
 * The page's language, from the `[lang]` route segment the middleware fills
 * in. Pages take it from params (not cookies()) so they can stay static.
 */
export function pageLang(params: { lang?: string }): Lang {
  return isLang(params.lang) ? params.lang : DEFAULT_LANG;
}

/** Translator for a server component on a public page. */
export async function getServerT(params: { lang?: string }): Promise<Translator> {
  const lang = pageLang(params);
  return makeTranslator(lang, await loadMessages(lang));
}
