import { cookies } from 'next/headers';
import { DEFAULT_LANG, LANG_COOKIE, isLang, type Lang } from './config';
import { makeTranslator, type Translator } from './core';
import { loadMessages } from './locales';

/** The visitor's language from the cookie (middleware also applies `?lang=`). */
export function getRequestLang(): Lang {
  try {
    const v = cookies().get(LANG_COOKIE)?.value;
    return isLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** Translator for a server component on a public page. */
export async function getServerT(): Promise<Translator> {
  const lang = getRequestLang();
  return makeTranslator(lang, await loadMessages(lang));
}
