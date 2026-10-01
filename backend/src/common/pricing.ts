import { Prisma, PriceRule } from '@prisma/client';
import { DateTime } from 'luxon';
import { ymd } from './time/validity';

/**
 * Peak-day pricing — the ONLY place a pass's per-person price is decided.
 * Used by availability(), createOrder() and the admin price preview, so what
 * a visitor sees is what they are charged.
 *
 * Precedence for (slot, date):
 *   1. Only active rules covering the date and the slot (empty timeSlotIds = all slots).
 *   2. Any matching DATES rule beats every WEEKENDS rule (explicit dates are deliberate).
 *   3. Within the winning tier the highest resulting price wins; ties → the oldest rule.
 * A rule's price is either a fixed price or base × (1 + uplift%), rounded to the paisa.
 * No matching rule → the slot's base price.
 */
export interface PricingRule {
  id: string;
  label: string;
  kind: 'DATES' | 'WEEKENDS';
  /** 'YYYY-MM-DD' calendar dates (DATES only). */
  dates: string[];
  timeSlotIds: string[];
  fixedPricePaise: number | null;
  upliftBps: number | null;
  createdAt: Date;
}

export interface EffectivePrice {
  pricePaise: number;
  basePaise: number;
  rule: { id: string; label: string } | null;
}

export function toPricingRule(r: PriceRule): PricingRule {
  return {
    id: r.id, label: r.label, kind: r.kind, dates: r.dates.map(ymd), timeSlotIds: r.timeSlotIds,
    fixedPricePaise: r.fixedPricePaise, upliftBps: r.upliftBps, createdAt: r.createdAt,
  };
}

/** Saturday or Sunday — a property of the calendar date, independent of timezone. */
export function isWeekend(date: string) {
  const wd = DateTime.fromISO(date, { zone: 'utc' }).weekday; // 1 = Mon … 7 = Sun
  return wd === 6 || wd === 7;
}

export function rulePricePaise(rule: Pick<PricingRule, 'fixedPricePaise' | 'upliftBps'>, basePaise: number) {
  if (rule.fixedPricePaise !== null) return rule.fixedPricePaise;
  return Math.round((basePaise * (10000 + (rule.upliftBps ?? 0))) / 10000);
}

export function effectivePrice(basePaise: number, slotId: string, date: string, rules: PricingRule[]): EffectivePrice {
  const covers = (r: PricingRule) =>
    (r.timeSlotIds.length === 0 || r.timeSlotIds.includes(slotId)) && (r.kind === 'DATES' ? r.dates.includes(date) : isWeekend(date));
  const matching = rules.filter(covers);
  const tier = matching.some((r) => r.kind === 'DATES') ? matching.filter((r) => r.kind === 'DATES') : matching;
  let best: { rule: PricingRule; price: number } | null = null;
  for (const rule of [...tier].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))) {
    const price = rulePricePaise(rule, basePaise);
    if (!best || price > best.price) best = { rule, price };
  }
  return best
    ? { pricePaise: best.price, basePaise, rule: { id: best.rule.id, label: best.rule.label } }
    : { pricePaise: basePaise, basePaise, rule: null };
}

export function decimalToPaise(d: Prisma.Decimal | string | number) {
  return Math.round(Number(d) * 100);
}

type Db = Pick<Prisma.TransactionClient, 'priceRule'>;

/** Active rules of one event, ready for effectivePrice(). */
export async function loadPricingRules(db: Db, eventId: string) {
  return (await db.priceRule.findMany({ where: { eventId, isActive: true } })).map(toPricingRule);
}
