import { displayNameProblem, screenText } from '../../src/common/moderation/abuse-words';
import { defaultDisplayName, reviewWindow } from '../../src/modules/reviews/reviews.rules';
import { DEFAULT_LAYOUT_ORDER, normalizeLayout, validateLayout } from '../../src/modules/landing/landing-layout';

describe('review auto-screening', () => {
  it('passes ordinary reviews (English, Hindi, Marathi)', () => {
    expect(screenText('Beautiful pandal, very well organised! 10/10')).toEqual([]);
    expect(screenText('बहुत सुंदर सजावट, भीड़ भी संभली हुई थी')).toEqual([]);
    expect(screenText('खूप छान आयोजन, Class decoration')).toEqual([]);
  });
  it('flags English, Hinglish and Devanagari abuse, including stretched/leet spellings', () => {
    expect(screenText('total bakchodi, organisers are chutiya')).toContain('ABUSIVE_LANGUAGE');
    expect(screenText('what a sh1t show')).toContain('ABUSIVE_LANGUAGE');
    expect(screenText('fuuuuck this queue')).toContain('ABUSIVE_LANGUAGE');
    expect(screenText('सब हरामी हैं')).toContain('ABUSIVE_LANGUAGE');
  });
  it('flags links, emails and phone numbers', () => {
    expect(screenText('visit www.cheap-deals.in now')).toEqual(['CONTAINS_LINK']);
    expect(screenText('see https://x.example')).toContain('CONTAINS_LINK');
    expect(screenText('mail me at a.b@gmail.com')).toContain('CONTAINS_EMAIL');
    expect(screenText('call +91 98765-43210')).toEqual(['CONTAINS_PHONE']);
    expect(screenText('Gate 2 opened at 18:30 on 12.10.2026')).toEqual([]);
  });
  it('display names may not carry contact details', () => {
    expect(displayNameProblem('Priya K.')).toBeNull();
    expect(displayNameProblem('Priya 9876543210')).toMatch(/phone/);
    expect(displayNameProblem('priya@x.in')).toMatch(/email/);
    expect(displayNameProblem('insta.com/priya')).toMatch(/link/);
  });
  it('default display name is first name + last initial', () => {
    expect(defaultDisplayName('Rohit Kumar Sharma')).toBe('Rohit S.');
    expect(defaultDisplayName('  Ananya ')).toBe('Ananya');
    expect(defaultDisplayName('अमित पाटील')).toBe('अमित प.');
  });
});

describe('review window (festival calendar)', () => {
  const e = { startDate: new Date('2026-10-10T00:00:00Z'), endDate: new Date('2026-10-12T00:00:00Z'), timezone: 'Asia/Kolkata' };
  it('opens on the first day in IST and closes 30 days after the last day', () => {
    // 2026-10-09 23:00 IST is still the day before.
    expect(reviewWindow(e, new Date('2026-10-09T17:30:00Z')).state).toBe('NOT_STARTED');
    // 2026-10-10 00:30 IST (= 19:00 UTC on the 9th) is the first day.
    expect(reviewWindow(e, new Date('2026-10-09T19:00:00Z')).state).toBe('OPEN');
    expect(reviewWindow(e, new Date('2026-11-11T12:00:00Z'))).toMatchObject({ state: 'OPEN', closesOn: '2026-11-11' });
    expect(reviewWindow(e, new Date('2026-11-11T19:00:00Z')).state).toBe('CLOSED');
  });
});

describe('landing layout', () => {
  it('defaults to every known section, hero first', () => {
    const l = normalizeLayout(null);
    expect(l.map((s) => s.id)).toEqual(DEFAULT_LAYOUT_ORDER);
    expect(l[0]).toEqual({ id: 'hero', visible: true, variant: 'DEFAULT' });
  });
  it('normalizes stored data leniently: unknown/duplicate ids dropped, bad variants defaulted, missing appended, hero forced first + visible', () => {
    const l = normalizeLayout([
      { id: 'gallery', visible: false, variant: 'CAROUSEL' }, { id: 'oldThing', visible: true }, { id: 'gallery', visible: true },
      { id: 'reviews', visible: true, variant: 'NOPE' }, { id: 'hero', visible: false },
    ]);
    expect(l[0]).toEqual({ id: 'hero', visible: true, variant: 'DEFAULT' });
    expect(l[1]).toEqual({ id: 'gallery', visible: false, variant: 'CAROUSEL' });
    expect(l[2]).toEqual({ id: 'reviews', visible: true, variant: 'CARDS' });
    expect(l).toHaveLength(DEFAULT_LAYOUT_ORDER.length);
    expect(new Set(l.map((s) => s.id)).size).toBe(l.length);
  });
  it('validates saves strictly: duplicate or invalid variant → 400, unknown id dropped', () => {
    expect(() => validateLayout([{ id: 'gallery', visible: true }, { id: 'gallery', visible: false }])).toThrow(/more than once/);
    expect(() => validateLayout([{ id: 'trophies', visible: true, variant: 'CAROUSEL' }])).toThrow(/not a layout/);
    const l = validateLayout([{ id: 'future', visible: true }, { id: 'trophies', visible: true, variant: 'GRID' }]);
    expect(l.map((s) => s.id).slice(0, 2)).toEqual(['hero', 'trophies']);
    expect(l.find((s) => s.id === 'future' as never)).toBeUndefined();
  });
});
