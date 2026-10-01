import { effectivePrice, isWeekend, PricingRule } from '../../src/common/pricing';
import { extendPaidUntil, socialUrl, whatsappNumber } from '../../src/modules/landing/landing.rules';

const rule = (r: Partial<PricingRule> & Pick<PricingRule, 'id' | 'kind'>): PricingRule => ({
  label: r.id, dates: [], timeSlotIds: [], fixedPricePaise: null, upliftBps: null, createdAt: new Date('2026-01-01'), ...r,
});

describe('peak-day pricing', () => {
  // 2026-10-17 is a Saturday, 2026-10-19 a Monday.
  const sat = '2026-10-17';
  const mon = '2026-10-19';
  it('knows weekends', () => {
    expect(isWeekend(sat)).toBe(true);
    expect(isWeekend('2026-10-18')).toBe(true);
    expect(isWeekend(mon)).toBe(false);
  });
  it('no rule → base price', () => {
    expect(effectivePrice(9000, 's1', mon, [rule({ id: 'w', kind: 'WEEKENDS', upliftBps: 2000 })])).toEqual({ pricePaise: 9000, basePaise: 9000, rule: null });
  });
  it('percentage uplift rounds to the paisa', () => {
    expect(effectivePrice(9000, 's1', sat, [rule({ id: 'w', kind: 'WEEKENDS', upliftBps: 2000 })]).pricePaise).toBe(10800);
    expect(effectivePrice(3333, 's1', sat, [rule({ id: 'w', kind: 'WEEKENDS', upliftBps: 1500 })]).pricePaise).toBe(3833);
  });
  it('explicit DATES beat WEEKENDS even when cheaper', () => {
    const r = [rule({ id: 'w', kind: 'WEEKENDS', upliftBps: 5000 }), rule({ id: 'd', kind: 'DATES', dates: [sat], fixedPricePaise: 10000 })];
    expect(effectivePrice(9000, 's1', sat, r)).toMatchObject({ pricePaise: 10000, rule: { id: 'd' } });
  });
  it('within a tier the highest price wins; ties go to the oldest rule', () => {
    const r = [
      rule({ id: 'a', kind: 'DATES', dates: [mon], upliftBps: 1000, createdAt: new Date('2026-02-01') }),
      rule({ id: 'b', kind: 'DATES', dates: [mon], fixedPricePaise: 12000 }),
      rule({ id: 'c', kind: 'DATES', dates: [mon], fixedPricePaise: 12000, createdAt: new Date('2026-03-01') }),
    ];
    expect(effectivePrice(10000, 's1', mon, r).rule?.id).toBe('b');
  });
  it('slot-scoped rules only touch their slots', () => {
    const r = [rule({ id: 'n', kind: 'DATES', dates: [mon], timeSlotIds: ['night'], upliftBps: 5000 })];
    expect(effectivePrice(10000, 'night', mon, r).pricePaise).toBe(15000);
    expect(effectivePrice(10000, 'day', mon, r).pricePaise).toBe(10000);
  });
});

describe('landing page rules', () => {
  it('validates social hosts over https', () => {
    expect(socialUrl('instagramUrl', 'https://instagram.com/x')).toBe('https://instagram.com/x');
    expect(socialUrl('youtubeUrl', ' ')).toBeNull();
    expect(() => socialUrl('instagramUrl', 'https://notinstagram.com/x')).toThrow();
    expect(() => socialUrl('facebookUrl', 'javascript:alert(1)')).toThrow();
  });
  it('normalises WhatsApp numbers', () => {
    expect(whatsappNumber('+91 98765-43210')).toBe('919876543210');
    expect(whatsappNumber('9876543210')).toBe('919876543210');
    expect(() => whatsappNumber('12345')).toThrow();
  });
  it('extends from the current expiry only while it is in the future', () => {
    const now = new Date('2026-10-01T00:00:00Z');
    expect(extendPaidUntil(new Date('2027-03-01T00:00:00Z'), 1, now).toISOString()).toBe('2028-03-01T00:00:00.000Z');
    expect(extendPaidUntil(new Date('2026-01-01T00:00:00Z'), 1, now).toISOString()).toBe('2027-10-01T00:00:00.000Z');
  });
});
