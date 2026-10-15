import { anonymousDonationCheck, donorIdHash, evaluate80G, financialYearOf, financialYearRange, isValidFy, normalizeDonorId, receiptMode } from '../../src/modules/tax/tax-rules';
import { commissionFor } from '../../src/modules/referrals/referral-rules';

const profile = { status: 'VERIFIED', validFrom: new Date('2025-04-01T00:00:00Z'), validTo: new Date('2030-03-31T00:00:00Z'), deductionPercent: 50 };
const base = { paymentStatus: 'SUCCESS', isAnonymous: false, method: 'UPI', amountPaise: 500_00, donatedAt: new Date('2026-10-01T06:00:00Z'), hasDonorId: true, profile, cashLimitPaise: 2000_00 };

describe('80G rules', () => {
  it('eligible only when every rule passes', () => {
    expect(evaluate80G(base)).toEqual({ eligible: true, deductionPercent: 50 });
    expect(evaluate80G({ ...base, paymentStatus: 'REFUNDED' })).toEqual({ eligible: false, reason: 'NOT_PAID' });
    expect(evaluate80G({ ...base, isAnonymous: true })).toEqual({ eligible: false, reason: 'ANONYMOUS' });
    expect(evaluate80G({ ...base, profile: null })).toEqual({ eligible: false, reason: 'NO_VERIFIED_80G' });
    expect(evaluate80G({ ...base, profile: { ...profile, status: 'SUBMITTED' } })).toEqual({ eligible: false, reason: 'NO_VERIFIED_80G' });
    expect(evaluate80G({ ...base, donatedAt: new Date('2030-04-01T06:00:00Z') })).toEqual({ eligible: false, reason: 'OUTSIDE_80G_VALIDITY' });
    expect(evaluate80G({ ...base, hasDonorId: false })).toEqual({ eligible: false, reason: 'DONOR_ID_MISSING' });
  });

  it('cash limit: ₹2,000 cash is fine, ₹2,001 is not; other modes have no limit', () => {
    expect(evaluate80G({ ...base, method: 'CASH', amountPaise: 2000_00 }).eligible).toBe(true);
    expect(evaluate80G({ ...base, method: 'CASH', amountPaise: 2001_00 })).toEqual({ eligible: false, reason: 'CASH_OVER_LIMIT' });
    expect(evaluate80G({ ...base, method: 'BANK_TRANSFER', amountPaise: 5_00_000_00 }).eligible).toBe(true);
  });

  it('validity compares IST calendar days (31 Mar 23:30 IST is still inside a registration ending 31 Mar)', () => {
    const p = { ...profile, validTo: new Date('2027-03-31T00:00:00Z') };
    expect(evaluate80G({ ...base, profile: p, donatedAt: new Date('2027-03-31T18:00:00Z') }).eligible).toBe(true);
    expect(evaluate80G({ ...base, profile: p, donatedAt: new Date('2027-03-31T18:31:00Z') }).eligible).toBe(false);
  });

  it('financial year in IST; 10BD due date', () => {
    expect(financialYearOf(new Date('2026-03-31T18:29:00Z'))).toBe('2025-26');
    expect(financialYearOf(new Date('2026-03-31T18:31:00Z'))).toBe('2026-27');
    expect(financialYearOf(new Date('2099-12-01T00:00:00Z'))).toBe('2099-00');
    expect(financialYearRange('2026-27').dueDate).toBe('2027-05-31');
    expect(isValidFy('2026-27')).toBe(true);
    expect(isValidFy('2026-28')).toBe(false);
  });

  it('donor IDs: normalized, validated, hashed per type', () => {
    expect(normalizeDonorId('PAN', ' abcde1234f ')).toBe('ABCDE1234F');
    expect(normalizeDonorId('PAN', 'ABCDE12345')).toBeNull();
    expect(normalizeDonorId('AADHAAR', '1234 5678 9012')).toBe('123456789012');
    expect(donorIdHash('PAN', 'ABCDE1234F')).toBe(donorIdHash('PAN', 'ABCDE1234F'));
    expect(donorIdHash('PAN', 'ABCDE1234F')).not.toBe(donorIdHash('PASSPORT', 'ABCDE1234F'));
  });

  it('10BD mode and the s.115BBC information figure', () => {
    expect(receiptMode('CASH')).toBe('Cash');
    expect(receiptMode('UPI')).toMatch(/^Electronic/);
    expect(anonymousDonationCheck(10_00_000_00, 2_00_000_00)).toEqual({ thresholdPaise: 1_00_000_00, abovePaise: 1_00_000_00 });
    expect(anonymousDonationCheck(1_00_00_000_00, 2_00_000_00).abovePaise).toBe(0); // 5% of ₹1 cr = ₹5 lakh
  });
});

describe('referral commission', () => {
  it('percent of the ticket value; fixed capped at it; nothing on free', () => {
    expect(commissionFor('PERCENT', 1000, 200_00)).toBe(20_00);
    expect(commissionFor('FIXED', 50_00, 30_00)).toBe(30_00);
    expect(commissionFor('FIXED', 50_00, 0)).toBe(0);
  });
});
