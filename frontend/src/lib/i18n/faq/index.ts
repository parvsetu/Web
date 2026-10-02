import { FAQ, type FaqSection } from '@/lib/faq';
import type { Lang } from '../config';

const LOADERS: Partial<Record<Lang, () => Promise<FaqSection[]>>> = {
  hi: () => import('./hi').then((m) => m.FAQ_HI),
  bn: () => import('./bn').then((m) => m.FAQ_BN),
  mr: () => import('./mr').then((m) => m.FAQ_MR),
  or: () => import('./or').then((m) => m.FAQ_OR),
  kn: () => import('./kn').then((m) => m.FAQ_KN),
};

/**
 * FAQ in the given language. Sections/items are matched to the English source
 * by id, so anything not yet translated (or added later in English) shows in English.
 */
export async function getFaq(lang: Lang): Promise<FaqSection[]> {
  const load = LOADERS[lang];
  if (!load) return FAQ;
  let tr: FaqSection[];
  try {
    tr = await load();
  } catch {
    return FAQ;
  }
  const secs = new Map(tr.map((s) => [s.id, s]));
  return FAQ.map((s) => {
    const ts = secs.get(s.id);
    if (!ts) return s;
    const items = new Map(ts.items.map((i) => [i.id, i]));
    return { ...s, title: ts.title || s.title, items: s.items.map((i) => items.get(i.id) ?? i) };
  });
}
