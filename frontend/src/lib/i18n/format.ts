/**
 * Locale-aware date/time helpers for the public pages. The logged-in app keeps
 * using lib/format.ts and the en-IN helpers in lib/booking.ts unchanged.
 * Money stays en-IN (₹1,00,000 grouping) everywhere — use fmtMoney.
 */

/**
 * Month / weekday names for locales whose CLDR data browsers often don't ship
 * (Chrome has no Odia date names). These always go through the table, on the
 * server and the client alike, so server HTML and hydration agree.
 */
const NAME_TABLES: Record<string, { monthsShort: string[]; months: string[]; weekdays: string[]; am: string; pm: string }> = {
  or: {
    monthsShort: ['ଜାନୁ', 'ଫେବୃ', 'ମାର୍ଚ୍ଚ', 'ଅପ୍ରେଲ', 'ମଇ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେ', 'ଅକ୍ଟୋ', 'ନଭେ', 'ଡିସେ'],
    months: ['ଜାନୁଆରୀ', 'ଫେବୃଆରୀ', 'ମାର୍ଚ୍ଚ', 'ଅପ୍ରେଲ', 'ମଇ', 'ଜୁନ', 'ଜୁଲାଇ', 'ଅଗଷ୍ଟ', 'ସେପ୍ଟେମ୍ବର', 'ଅକ୍ଟୋବର', 'ନଭେମ୍ବର', 'ଡିସେମ୍ବର'],
    weekdays: ['ରବି', 'ସୋମ', 'ମଙ୍ଗଳ', 'ବୁଧ', 'ଗୁରୁ', 'ଶୁକ୍ର', 'ଶନି'],
    am: 'ପୂର୍ବାହ୍ନ',
    pm: 'ଅପରାହ୍ନ',
  },
};

/** Formats with en-IN, then swaps month/weekday/am-pm names from the table. */
function tableFormat(lang: string, o: Intl.DateTimeFormatOptions, d: Date): string {
  const tb = NAME_TABLES[lang];
  const tz = o.timeZone;
  const get = (opt: Intl.DateTimeFormatOptions) => Number(new Intl.DateTimeFormat('en-US', { ...opt, timeZone: tz }).format(d));
  return new Intl.DateTimeFormat('en-IN', o)
    .formatToParts(d)
    .map((p) => {
      if (p.type === 'month') return (o.month === 'long' ? tb.months : tb.monthsShort)[get({ month: 'numeric' }) - 1] ?? p.value;
      if (p.type === 'weekday') {
        const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(d);
        return tb.weekdays[['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)] ?? p.value;
      }
      if (p.type === 'dayPeriod') return /p/i.test(p.value) ? tb.pm : tb.am;
      return p.value;
    })
    .join('');
}

function ymdToUtc(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

function safe(locale: string, o: Intl.DateTimeFormatOptions, d: Date): string {
  const lang = locale.split('-')[0];
  if (NAME_TABLES[lang]) {
    try {
      return tableFormat(lang, o, d);
    } catch {
      /* fall through */
    }
  }
  try {
    return new Intl.DateTimeFormat(locale, o).format(d);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-IN', { ...o, timeZone: o.timeZone && o.timeZone !== 'UTC' ? undefined : o.timeZone }).format(d);
    } catch {
      return d.toISOString();
    }
  }
}

/** "1 Oct 2026" for a YYYY-MM-DD calendar date (no timezone shift). */
export function fmtDateL(date: string | null | undefined, locale: string): string {
  if (!date) return '—';
  const d = ymdToUtc(date);
  // Some CLDR patterns glue the year on ("ಸೆಪ್ಟೆಂ 30,2026"); add the space back.
  return d ? safe(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }, d).replace(/,(\d)/, ', $1') : date;
}

/** "1 Oct 2026" or "1 Oct 2026 – 5 Oct 2026". */
export function fmtRangeL(start: string, end: string, locale: string): string {
  return start === end ? fmtDateL(start, locale) : `${fmtDateL(start, locale)} – ${fmtDateL(end, locale)}`;
}

/** Weekday / day / month parts of a calendar date for the date chips. */
export function dayPartsL(date: string, locale: string): { weekday: string; day: string; month: string } {
  const d = ymdToUtc(date);
  if (!d) return { weekday: '', day: date, month: '' };
  const f = (o: Intl.DateTimeFormatOptions) => safe(locale, { ...o, timeZone: 'UTC' }, d);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

function fmtIn(iso: string, tz: string, locale: string, o: Intl.DateTimeFormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: tz });
    return safe(locale, { ...o, timeZone: tz }, d);
  } catch {
    return safe(locale, o, d);
  }
}

export const fmtPassDayL = (iso: string, tz: string, locale: string) => fmtIn(iso, tz, locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const fmtPassTimeL = (iso: string, tz: string, locale: string) => fmtIn(iso, tz, locale, { hour: 'numeric', minute: '2-digit', hour12: true });

/** "Thu, 1 Oct 2026 · 5:00 pm – 7:00 pm" (end day shown when it differs). */
export function fmtPassWindowL(from: string, until: string, tz: string, locale: string): string {
  const d1 = fmtPassDayL(from, tz, locale);
  const d2 = fmtPassDayL(until, tz, locale);
  return d1 === d2
    ? `${d1} · ${fmtPassTimeL(from, tz, locale)} – ${fmtPassTimeL(until, tz, locale)}`
    : `${d1}, ${fmtPassTimeL(from, tz, locale)} – ${d2}, ${fmtPassTimeL(until, tz, locale)}`;
}

/** Slot wall-clock time "17:00" → "5 pm" (English) or the locale's own form. */
export function fmtHHmmL(t: string, locale: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]) % 24;
  if (locale.startsWith('en')) {
    const suffix = h < 12 ? 'am' : 'pm';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m[2] === '00' ? `${h12} ${suffix}` : `${h12}:${m[2]} ${suffix}`;
  }
  const d = new Date(Date.UTC(2000, 0, 1, h, Number(m[2])));
  return safe(locale, { timeZone: 'UTC', hour: 'numeric', minute: m[2] === '00' ? undefined : '2-digit', hour12: true }, d);
}

/** Long date + time for a donation receipt, in the given timezone. */
export function fmtLongDateTimeL(iso: string, tz: string, locale: string): string {
  return fmtIn(iso, tz, locale, { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}
