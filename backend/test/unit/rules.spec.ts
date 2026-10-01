import { classify } from '../../src/modules/tokens/scan.service';
import { effectiveStatus } from '../../src/modules/tokens/token-presenter';
import { slotWindow, slotCrossesMidnight, dayRange } from '../../src/common/time/validity';
import { QrSigner } from '../../src/common/qr/qr-signer';
import { amountInWords } from '../../src/common/money';
import { toCsv } from '../../src/common/http';
import { AccessService } from '../../src/common/access/access.service';
import { corsOrigins } from '../../src/app.setup';

const now = new Date('2026-10-01T12:00:00Z');
const t = (status: 'ACTIVE' | 'USED' | 'CANCELLED', fromMin: number, untilMin: number) => ({
  status, validFrom: new Date(now.getTime() + fromMin * 60_000), validUntil: new Date(now.getTime() + untilMin * 60_000),
});

describe('scan classification', () => {
  it('reports cancelled and used before any time check', () => {
    expect(classify(t('CANCELLED', -10, -5), now)).toBe('CANCELLED');
    expect(classify(t('USED', -10, -5), now)).toBe('ALREADY_USED');
  });
  it('expired / not yet valid', () => {
    expect(classify(t('ACTIVE', -10, -5), now)).toBe('EXPIRED');
    expect(classify(t('ACTIVE', -10, 0), now)).toBe('EXPIRED'); // validUntil exclusive
    expect(classify(t('ACTIVE', 5, 10), now)).toBe('NOT_YET_VALID');
  });
  it('effective status mirrors the gate', () => {
    expect(effectiveStatus(t('ACTIVE', -1, 1), now)).toBe('ACTIVE');
    expect(effectiveStatus(t('ACTIVE', 1, 2), now)).toBe('NOT_YET_VALID');
    expect(effectiveStatus(t('ACTIVE', -2, -1), now)).toBe('EXPIRED');
  });
});

describe('slot windows', () => {
  it('converts event-local slot times to UTC', () => {
    const w = slotWindow('2026-10-05', '19:00', '21:00', 'Asia/Kolkata');
    expect(w.validFrom.toISOString()).toBe('2026-10-05T13:30:00.000Z');
    expect(w.validUntil.toISOString()).toBe('2026-10-05T15:30:00.000Z');
  });
  it('handles slots crossing midnight and DST zones', () => {
    expect(slotCrossesMidnight('23:00', '01:00')).toBe(true);
    const w = slotWindow('2026-10-05', '23:00', '01:00', 'Asia/Kolkata');
    expect(w.validUntil.toISOString()).toBe('2026-10-05T19:30:00.000Z');
    // London on the DST change day: 00:30–03:30 is 3h on the wall clock but 4h elapsed (clocks go back at 02:00).
    const dst = slotWindow('2026-10-25', '00:30', '03:30', 'Europe/London');
    expect((dst.validUntil.getTime() - dst.validFrom.getTime()) / 3600_000).toBe(4);
  });
  it('day ranges are local-day bounds', () => {
    const r = dayRange('2026-10-01', '2026-10-01', 'Asia/Kolkata');
    expect(r.gte.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(r.lt.toISOString()).toBe('2026-10-01T18:30:00.000Z');
  });
});

describe('QR signing', () => {
  const qr = new QrSigner();
  it('round-trips and rejects tampering', () => {
    const tok = qr.newSecureToken();
    const payload = qr.payloadFor(tok);
    expect(qr.verify(payload)).toBe(tok);
    expect(qr.verify(payload.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(qr.verify(`PSQR1.${qr.newSecureToken()}.${payload.split('.')[2]}`)).toBeNull();
    expect(qr.verify('PSQR2' + payload.slice(5))).toBeNull();
    expect(qr.verify('x'.repeat(500))).toBeNull();
  });
  it('accepts the payload inside a Parvsetu link', () => {
    const tok = qr.newSecureToken();
    const p = qr.payloadFor(tok);
    expect(qr.verify(`https://parvsetu-web.vercel.app/v/${p}`)).toBe(tok);
    expect(qr.verify(`https://x.example/v/${p}?utm=1`)).toBe(tok);
    expect(qr.verify(`https://x.example/v/${p.slice(0, -2)}`)).toBeNull();
  });

  it('payload contains no personal data and is unguessable', () => {
    const a = qr.payloadFor(qr.newSecureToken());
    const b = qr.payloadFor(qr.newSecureToken());
    expect(a).not.toBe(b);
    expect(a.split('.')[1]).toHaveLength(22); // 128 bits base64url
  });
});

describe('helpers', () => {
  it('amount in words (Indian system)', () => {
    expect(amountInWords('125050.50')).toBe('One Lakh Twenty Five Thousand Fifty Rupees and Fifty Paise Only');
    expect(amountInWords('1000')).toBe('One Thousand Rupees Only');
    expect(amountInWords('12500000')).toBe('One Crore Twenty Five Lakh Rupees Only');
  });
  it('CSV neutralises formula injection', () => {
    const csv = toCsv([{ name: '=HYPERLINK("x")', note: 'a,b' }]);
    expect(csv.split('\n')[1]).toBe(`"'=HYPERLINK(""x"")","a,b"`);
  });
  it('role escalation guard is a strict subset check', () => {
    const svc = new AccessService({} as never);
    expect(svc.canGrant(new Set(['A', 'B']), ['A'])).toBe(true);
    expect(svc.canGrant(new Set(['A']), ['A', 'B'])).toBe(false);
  });
});

describe('CORS allow-list', () => {
  it('wildcard matches one label only', () => {
    const [re, exact] = corsOrigins('https://parvsetu-*.vercel.app, https://app.example.org') as [RegExp, string];
    expect(re.test('https://parvsetu-abc123-team.vercel.app')).toBe(true);
    expect(re.test('https://parvsetu-x.vercel.app.evil.com')).toBe(false);
    expect(re.test('https://parvsetu-a.b.vercel.app')).toBe(false);
    expect(exact).toBe('https://app.example.org');
  });
});
