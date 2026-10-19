/**
 * Festival page addresses: /f/<slug>, e.g. /f/durga-puja-2026. The year is
 * required because the same festival comes back every year — durga-puja-2026
 * and durga-puja-2027 are different pages. Old slugs stay as aliases, so a
 * link shared last month still opens the page and no one else can take it.
 */
export const EVENT_SLUG_MIN = 6;
export const EVENT_SLUG_MAX = 80;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Words a slug can't be (they are, or may become, routes / look official). */
const RESERVED = new Set([
  'admin', 'api', 'app', 'book', 'compete', 'competitions', 'dashboard', 'edit', 'gallery', 'login', 'new', 'parvsetu',
  'platform', 'poster', 'programme', 'register', 'settings', 'support', 'test',
]);

export function isUuid(s: string) {
  return UUID_RE.test(s);
}

/** "Durga Puja — 2026 (Salt Lake)" → "durga-puja-2026-salt-lake". Non-Latin text is dropped. */
export function normaliseSlug(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, EVENT_SLUG_MAX)
    .replace(/-+$/g, '');
}

const hasYear = (slug: string, year: number) => slug.split('-').includes(String(year));

/** Adds the festival year if missing and keeps it within the length limit. */
export function withYear(slug: string, year: number): string {
  if (hasYear(slug, year)) return slug;
  const room = EVENT_SLUG_MAX - 5;
  return `${slug.slice(0, room).replace(/-+$/g, '')}-${year}`.replace(/^-/, '');
}

/** null when fine, else what's wrong (shown to the organiser). */
export function slugProblem(slug: string, year: number): string | null {
  if (slug.length < EVENT_SLUG_MIN) return `Use at least ${EVENT_SLUG_MIN} characters.`;
  if (slug.length > EVENT_SLUG_MAX) return `Use at most ${EVENT_SLUG_MAX} characters.`;
  if (!SLUG_RE.test(slug)) return 'Use only small letters a–z, digits and single hyphens (no spaces).';
  if (isUuid(slug)) return 'Choose a readable address.';
  if (!hasYear(slug, year)) return `Include the festival year ${year} (e.g. “…-${year}”) — the same festival repeats every year.`;
  if (slug.split('-').every((w) => /^\d+$/.test(w))) return 'Add a few words, not just numbers.';
  if (RESERVED.has(slug.split('-')[0]) && slug.split('-').length <= 2) return 'That address is reserved. Add your festival or mandal name.';
  return null;
}

/**
 * Default addresses for a new festival: mandal + name + year first (many mandals hold
 * "Durga Puja 2026", so the bare name shouldn't go to whoever came first), then
 * name + year, then numbered. Organisers can pick a shorter one themselves if it's free.
 */
export function slugCandidates(eventName: string, orgName: string, year: number): string[] {
  const name = normaliseSlug(eventName.replace(String(year), '')) || 'festival';
  const org = normaliseSlug(orgName);
  // Don't repeat the mandal's words when the festival name already starts with them.
  const combined = org && !name.startsWith(org) ? `${org}-${name}` : name;
  const first = withYear(combined, year);
  const list = [first, withYear(name, year)];
  for (let i = 2; i <= 50; i++) list.push(`${first.slice(0, EVENT_SLUG_MAX - 4).replace(/-+$/g, '')}-${i}`);
  return [...new Set(list)].filter((s) => !slugProblem(s, year));
}
