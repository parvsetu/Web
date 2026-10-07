/**
 * Auto-screening for visitor reviews. A match never blocks a review — it only
 * sets `flagged` (with reasons) so the mandal sees it highlighted in the
 * moderation queue. Keep the word list here, in one place; it is deliberately
 * small (common English, Hinglish and Hindi abuse) and errs on the side of
 * flagging, since a human always decides.
 */

/** Latin-script words (English + Hinglish), matched as whole words after normalising. */
export const ABUSE_WORDS_LATIN = [
  // English
  'fuck', 'fucking', 'fucker', 'fck', 'fuk', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dick', 'dickhead',
  'cunt', 'slut', 'whore', 'motherfucker', 'mf', 'retard', 'wtf', 'stfu', 'porn', 'nude', 'nudes', 'sex',
  // Hinglish
  'chutiya', 'chutiye', 'chutia', 'chootiya', 'madarchod', 'madarchood', 'maderchod', 'mc', 'behenchod', 'bhenchod', 'behanchod', 'bc',
  'bsdk', 'bhosdike', 'bhosdi', 'bhosdiwale', 'bhosda', 'gandu', 'gaandu', 'gaand', 'gand', 'lund', 'lauda', 'lavda', 'loda', 'lodu',
  'randi', 'rand', 'harami', 'haramkhor', 'haramzada', 'haramzade', 'kamina', 'kamine', 'kutte', 'kutta', 'kutiya', 'tatti', 'jhatu',
  'jhaatu', 'chodu', 'chod', 'chodna', 'chut', 'suar', 'ullu', 'bakchod', 'bakchodi',
] as const;

/** Devanagari words, matched as substrings (word boundaries don't apply to Indic scripts in JS regex). */
export const ABUSE_WORDS_DEVANAGARI = [
  'चूतिया', 'चुतिया', 'चूतिये', 'मादरचोद', 'मादरचौद', 'बहनचोद', 'बहनचौद', 'भेनचोद', 'भोसड़ी', 'भोसडी', 'भोसड़ीके', 'गांडू', 'गाण्डू', 'गांड',
  'लौड़ा', 'लौडा', 'लंड', 'रंडी', 'हरामी', 'हरामखोर', 'हरामज़ादा', 'हरामजादा', 'कमीना', 'कमीने', 'कुत्ते', 'कुतिया', 'टट्टी', 'झाटू', 'चोदू', 'बकचोद',
] as const;

export type FlagReason = 'ABUSIVE_LANGUAGE' | 'CONTAINS_LINK' | 'CONTAINS_PHONE' | 'CONTAINS_EMAIL';

const LATIN = new Set<string>(ABUSE_WORDS_LATIN);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

const LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|in|net|org|co|io|me|ly|xyz|info|biz|app|link|site|online|shop)\b|wa\.me|t\.me|bit\.ly)/i;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;

function hasPhone(text: string) {
  // 10+ digits, allowing spaces, dashes, dots and brackets between them (e.g. "+91 98765-43210").
  for (const m of text.matchAll(/\+?\d[\d\s().-]{8,}\d/g)) {
    if (m[0].replace(/\D/g, '').length >= 10) return true;
  }
  return false;
}

function latinWords(text: string) {
  const lower = text.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c);
  // Collapse letters repeated 3+ times ("fuuuck" → "fuck") before splitting into words.
  return lower.replace(/([a-z])\1{2,}/g, '$1').split(/[^a-z]+/).filter(Boolean);
}

/** Reasons a piece of visitor text should be highlighted for the mandal (empty = clean). */
export function screenText(...parts: (string | null | undefined)[]): FlagReason[] {
  const text = parts.filter(Boolean).join('\n');
  if (!text.trim()) return [];
  const reasons = new Set<FlagReason>();
  if (latinWords(text).some((w) => LATIN.has(w)) || ABUSE_WORDS_DEVANAGARI.some((w) => text.includes(w))) reasons.add('ABUSIVE_LANGUAGE');
  if (LINK_RE.test(text)) reasons.add('CONTAINS_LINK');
  if (EMAIL_RE.test(text)) reasons.add('CONTAINS_EMAIL');
  if (hasPhone(text)) reasons.add('CONTAINS_PHONE');
  return [...reasons];
}

/** Display names must not carry contact details or links (they are shown publicly). */
export function displayNameProblem(name: string): string | null {
  if (EMAIL_RE.test(name) || name.includes('@')) return 'The display name can’t contain an email address.';
  if (LINK_RE.test(name)) return 'The display name can’t contain a link.';
  if ((name.match(/\d/g) ?? []).length >= 5) return 'The display name can’t contain a phone number.';
  return null;
}
