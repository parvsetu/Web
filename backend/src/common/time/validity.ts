import { BadRequestException } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: string) {
  return IANAZone.isValidZone(tz);
}

/** A DATE column value (UTC midnight) → 'YYYY-MM-DD'. */
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date at UTC midnight (for @db.Date columns). */
export function dateOnly(s: string): Date {
  if (!YMD.test(s) || !DateTime.fromISO(s, { zone: 'utc' }).isValid) {
    throw new BadRequestException(`Invalid date "${s}" (expected YYYY-MM-DD)`);
  }
  return new Date(`${s}T00:00:00.000Z`);
}

export function slotCrossesMidnight(startTime: string, endTime: string) {
  return endTime <= startTime;
}

/** Concrete UTC window for a daily slot on a calendar date in the event's zone. */
export function slotWindow(date: string, startTime: string, endTime: string, timezone: string) {
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timezone });
  let end = DateTime.fromISO(`${date}T${endTime}`, { zone: timezone });
  if (!start.isValid || !end.isValid) throw new BadRequestException('Invalid date or slot time');
  if (slotCrossesMidnight(startTime, endTime)) end = end.plus({ days: 1 });
  return { validFrom: start.toUTC().toJSDate(), validUntil: end.toUTC().toJSDate() };
}

/** Today's calendar date in a zone. */
export function todayIn(timezone: string, now = new Date()): string {
  return DateTime.fromJSDate(now, { zone: timezone }).toISODate()!;
}

/** UTC [start, end) bounds of calendar dates `from`..`to` (inclusive) in a zone. */
export function dayRange(from: string, to: string, timezone: string) {
  const start = DateTime.fromISO(from, { zone: timezone }).startOf('day');
  const end = DateTime.fromISO(to, { zone: timezone }).plus({ days: 1 }).startOf('day');
  if (!start.isValid || !end.isValid) throw new BadRequestException('Invalid date range');
  if (end <= start) throw new BadRequestException('"to" must not be before "from"');
  return { gte: start.toUTC().toJSDate(), lt: end.toUTC().toJSDate() };
}

export function formatInZone(d: Date, timezone: string) {
  return DateTime.fromJSDate(d, { zone: timezone }).toFormat('dd LLL yyyy, h:mm a');
}
