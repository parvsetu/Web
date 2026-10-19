import {
  ageOn, centreOutLanes, computeRanks, eligibility, formatTime, parseTime, publicName, quoteEntry, seededShuffle,
} from '../../src/modules/competitions/competitions.rules';

describe('competition rules', () => {
  it('parses and formats race times', () => {
    expect(parseTime('1:05.32')).toBe(65320);
    expect(parseTime('65.32')).toBe(65320);
    expect(parseTime('0:59')).toBe(59000);
    expect(parseTime('1:02:03.5')).toBe(3723500);
    expect(parseTime('9.5')).toBe(9500);
    expect(formatTime(65320)).toBe('1:05.32');
    expect(formatTime(9500)).toBe('9.50');
    expect(formatTime(3723500)).toBe('1:02:03.50');
    for (const bad of ['1:75', 'abc', '', '1::2', '0', '1:2:3:4', '-5']) expect(() => parseTime(bad)).toThrow();
  });

  it('ranks by time (lowest) or score (highest), ties share a place, DNF gets none', () => {
    const r = (id: string, resultStatus: string, resultMs: number | null, resultScore: number | null = null) => ({ id, resultStatus, resultMs, resultScore });
    const t = computeRanks('TIME', [r('a', 'FINISHED', 3000), r('b', 'FINISHED', 2000), r('c', 'FINISHED', 2000), r('d', 'DNF', 1000), r('e', 'FINISHED', null)]);
    expect(Object.fromEntries(t)).toEqual({ a: 3, b: 1, c: 1, d: null, e: null });
    const s = computeRanks('SCORE', [r('a', 'FINISHED', null, 7), r('b', 'FINISHED', null, 9.5), r('c', 'DQ', null, 10)]);
    expect(Object.fromEntries(s)).toEqual({ a: 2, b: 1, c: null });
  });

  it('checks age on the day and gender', () => {
    expect(ageOn('2012-10-05', '2026-10-04')).toBe(13);
    expect(ageOn('2012-10-05', '2026-10-05')).toBe(14);
    const u14g = { gender: 'FEMALE', minAge: 10, maxAge: 13 };
    expect(eligibility(u14g, 'FEMALE', 13)).toBeNull();
    expect(eligibility(u14g, 'FEMALE', 14)).toMatch(/10–13/);
    expect(eligibility(u14g, 'MALE', 12)).toMatch(/girls/);
    expect(eligibility({ gender: 'ANY', minAge: null, maxAge: null }, 'OTHER', 40)).toBeNull();
  });

  it('quotes fee + GST on top + platform share of the fee', () => {
    expect(quoteEntry({ feePaise: 20000, gstOn: false, commissionBps: 500 })).toEqual({ basePaise: 20000, gstRateBps: 0, gstPaise: 0, amountPaise: 20000, platformFeePaise: 1000 });
    expect(quoteEntry({ feePaise: 20000, gstOn: true, commissionBps: 500 })).toMatchObject({ gstPaise: 3600, amountPaise: 23600, platformFeePaise: 1000 });
    expect(quoteEntry({ feePaise: 0, gstOn: true, commissionBps: 500 })).toMatchObject({ amountPaise: 0, gstRateBps: 0 });
  });

  it('lanes fill from the middle; shuffles repeat for the same seed; names are shortened', () => {
    expect(centreOutLanes(6)).toEqual([3, 4, 2, 5, 1, 6]);
    expect(centreOutLanes(5)).toEqual([3, 4, 2, 5, 1]);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(seededShuffle(ids, 'x')).toEqual(seededShuffle(ids, 'x'));
    expect([...seededShuffle(ids, 'x')].sort()).toEqual(ids);
    expect(publicName('Riya  Sharma')).toBe('Riya S.');
    expect(publicName('Arjun')).toBe('Arjun');
  });
});
