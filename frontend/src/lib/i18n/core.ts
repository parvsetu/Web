/**
 * Translator core shared by the client provider and server components.
 * No React state here — just pure functions over a dictionary.
 */
import { Fragment, createElement, type ReactNode } from 'react';
import { intlLocale, type Lang } from './config';
import en, { type MessageKey, type Messages } from './locales/en';

export type { MessageKey, Messages };
export type Vars = Record<string, string | number>;

/** Keys that have `_one` / `_other` forms, without the suffix. */
export type PluralKey = { [K in MessageKey]: K extends `${infer B}_other` ? B : never }[MessageKey];

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export interface Translator {
  lang: Lang;
  /** BCP-47 locale for Intl (Western digits). */
  locale: string;
  t: (key: MessageKey, vars?: Vars) => string;
  /** Plural: picks `<key>_one` / `<key>_other` by Intl.PluralRules; `{n}` is filled with the count. */
  tp: (key: PluralKey, n: number, vars?: Vars) => string;
  /** Like `t`, but `{var}` may be a React node (links, bold words). */
  tn: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
  /** True when the key exists in the active dictionary or English. */
  has: (key: string) => boolean;
  /** Display name of a festival type key (e.g. GANESH_UTSAV); falls back to a readable form of the key. */
  festivalType: (type: string | null | undefined) => string;
  /** Popular city display name (falls back to the name as stored). */
  city: (name: string) => string;
}

export function makeTranslator(lang: Lang, messages: Partial<Messages> | null | undefined): Translator {
  const locale = intlLocale(lang);
  const dict = (messages ?? {}) as Partial<Record<string, string>>;
  const base = en as Record<string, string>;
  const raw = (key: string): string | undefined => {
    const v = dict[key];
    return v !== undefined && v !== '' ? v : base[key];
  };
  let rules: Intl.PluralRules | null = null;
  const plural = (n: number) => {
    try {
      rules ??= new Intl.PluralRules(locale);
      return rules.select(n) === 'one' ? 'one' : 'other';
    } catch {
      return n === 1 ? 'one' : 'other';
    }
  };
  const t = (key: MessageKey, vars?: Vars) => interpolate(raw(key) ?? key, vars);
  const tp = (key: PluralKey, n: number, vars?: Vars) => {
    const s = raw(`${key}_${plural(n)}`) ?? raw(`${key}_other`) ?? key;
    return interpolate(s, { n, ...vars });
  };
  const tn = (key: MessageKey, vars: Record<string, ReactNode>) => {
    const parts = (raw(key) ?? key).split(/(\{\w+\})/g);
    return createElement(
      Fragment,
      null,
      ...parts.map((p, i) => {
        const m = /^\{(\w+)\}$/.exec(p);
        return createElement(Fragment, { key: i }, m && m[1] in vars ? vars[m[1]] : p);
      }),
    );
  };
  const has = (key: string) => raw(key) !== undefined;
  const festivalType = (type: string | null | undefined) => {
    if (!type) return '';
    const v = raw(`ft.${type}`);
    if (v) return v;
    const h = type.replace(/_/g, ' ').toLowerCase();
    return h.charAt(0).toUpperCase() + h.slice(1);
  };
  const city = (name: string) => {
    const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
    return raw(`city.${name}`) ?? raw(`city.${title}`) ?? name;
  };
  return { lang, locale, t, tp, tn, has, festivalType, city };
}

/** Kept tiny so `en` is always available synchronously. */
export const englishTranslator = makeTranslator('en', null);
