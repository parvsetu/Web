/** Client-side browsing helpers for the public explore page (city, category, date, price). */
import type { BookableEvent } from './booking-types';

export interface Category {
  key: string;
  label: string;
  emoji: string;
  /** Compact label for the header strip. */
  short?: string;
  /** Festival-type groups (backend FESTIVAL_TYPES.group) in this category. */
  groups: string[];
}

export const CATEGORIES: Category[] = [
  { key: 'festivals', label: 'Festivals', emoji: '🪔', groups: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Parsi', 'Regional & Harvest', 'National & Cultural'] },
  { key: 'religious', label: 'Religious gatherings', short: 'Religious', emoji: '🙏', groups: ['Religious Gatherings'] },
  { key: 'fairs', label: 'Fairs & carnivals', emoji: '🎡', groups: ['Fairs & Carnivals'] },
  { key: 'exhibitions', label: 'Exhibitions', emoji: '🧵', groups: ['Exhibitions & Trade'] },
  { key: 'shows', label: 'Shows & culture', emoji: '🎭', groups: ['Cultural & Entertainment'] },
  { key: 'sports', label: 'Sports & community', emoji: '🏏', groups: ['Community & Sports'] },
  { key: 'other', label: 'Other events', short: 'Other', emoji: '✨', groups: ['Other'] },
];

export function categoryOf(festivalType: string, groupOf: Map<string, string>): string {
  const g = groupOf.get(festivalType);
  return CATEGORIES.find((c) => g && c.groups.includes(g))?.key ?? 'other';
}

export const POPULAR_CITIES = ['Mumbai', 'Pune', 'Nagpur', 'Kolkata', 'Delhi', 'Ahmedabad', 'Bengaluru', 'Hyderabad', 'Chennai', 'Jaipur', 'Lucknow', 'Indore'];

export const eventCity = (e: Pick<BookableEvent, 'city' | 'organization'>) => e.city || e.organization.city || '';

/** Today as YYYY-MM-DD in India. */
export function todayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type DateFilter = '' | 'today' | 'tomorrow' | 'weekend' | 'week' | 'month';

export const DATE_FILTERS: { key: DateFilter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'month', label: 'Next 30 days' },
];

/** [from, to] inclusive window for a date filter. */
export function dateWindow(f: DateFilter, today = todayIst()): [string, string] | null {
  if (!f) return null;
  if (f === 'today') return [today, today];
  if (f === 'tomorrow') return [addDays(today, 1), addDays(today, 1)];
  if (f === 'week') return [today, addDays(today, 6)];
  if (f === 'month') return [today, addDays(today, 29)];
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  const sat = dow === 0 ? addDays(today, -1) : addDays(today, 6 - dow);
  return [sat < today ? today : sat, addDays(sat, 1)];
}

export const overlaps = (e: Pick<BookableEvent, 'startDate' | 'endDate'>, [from, to]: [string, string]) => e.startDate <= to && e.endDate >= from;

export type PriceFilter = '' | 'free' | 'u100' | '100-500' | 'o500';

export const PRICE_FILTERS: { key: PriceFilter; label: string }[] = [
  { key: 'free', label: 'Free entry' },
  { key: 'u100', label: 'Under ₹100' },
  { key: '100-500', label: '₹100 – ₹500' },
  { key: 'o500', label: 'Above ₹500' },
];

export function matchesPrice(fromPrice: string | null, f: PriceFilter): boolean {
  if (!f) return true;
  if (fromPrice === null) return false;
  const p = Number(fromPrice);
  return f === 'free' ? p === 0 : f === 'u100' ? p < 100 : f === '100-500' ? p >= 100 && p <= 500 : p > 500;
}

export type SortKey = 'soon' | 'price' | 'name';

export interface ExploreFilters {
  city: string;
  q: string;
  cat: string;
  date: DateFilter;
  price: PriceFilter;
  sort: SortKey;
}

export function applyFilters(events: BookableEvent[], f: ExploreFilters, groupOf: Map<string, string>, today = todayIst()): BookableEvent[] {
  const t = f.q.trim().toLowerCase();
  const win = dateWindow(f.date, today);
  const out = events.filter(
    (e) =>
      e.endDate >= today &&
      (!f.city || eventCity(e).toLowerCase() === f.city.toLowerCase()) &&
      (!t || `${e.name} ${e.organization.name} ${e.location ?? ''} ${e.festivalType.replace(/_/g, ' ')}`.toLowerCase().includes(t)) &&
      (!f.cat || categoryOf(e.festivalType, groupOf) === f.cat) &&
      (!win || overlaps(e, win)) &&
      matchesPrice(e.fromPrice, f.price),
  );
  const price = (e: BookableEvent) => (e.fromPrice === null ? Number.POSITIVE_INFINITY : Number(e.fromPrice));
  return out.sort((a, b) =>
    f.sort === 'price' ? price(a) - price(b) : f.sort === 'name' ? a.name.localeCompare(b.name) : a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
  );
}

export const isLive = (e: Pick<BookableEvent, 'startDate' | 'endDate'>, today = todayIst()) => e.startDate <= today && e.endDate >= today;

const CITY_KEY = 'parvsetu.city';
export function loadCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}
export function saveCity(city: string) {
  try {
    localStorage.setItem(CITY_KEY, city);
  } catch {
    /* private mode — the URL still carries the city */
  }
}
