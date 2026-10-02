import type { Lang } from '../config';
import type { Messages } from './en';

/**
 * Lazy loaders, one per non-English locale, so a visitor only downloads the
 * dictionary they use. English is bundled (it is the fallback for every key).
 */
export const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<Messages>> = {
  hi: () => import('./hi').then((m) => m.default),
  bn: () => import('./bn').then((m) => m.default),
  mr: () => import('./mr').then((m) => m.default),
  or: () => import('./or').then((m) => m.default),
  kn: () => import('./kn').then((m) => m.default),
};

export async function loadMessages(lang: Lang): Promise<Messages | null> {
  if (lang === 'en') return null;
  try {
    return await LOADERS[lang]();
  } catch {
    return null;
  }
}
