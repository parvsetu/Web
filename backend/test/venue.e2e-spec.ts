/** Mandal festival preferences, event venue/directions on passes, and the "N passes left" allowance. */
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Festival preferences, venue and pass allowance (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  it('the super admin sets a mandal\'s festivals (unknown keys rejected; the mandal can\'t change them); events see the list', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
    // Allowed festivals are platform-controlled since mandal registration review.
    const locked = await ctx.http().patch(api(`/organizations/${m.org.id}`)).set('Authorization', auth).send({ festivalTypes: ['DURGA_PUJA'] });
    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe('FESTIVAL_TYPES_LOCKED');
    expect((await ctx.http().patch(api(`/organizations/${m.org.id}`)).set('Authorization', sa).send({ festivalTypes: ['NOT_A_FESTIVAL'] })).status).toBe(400);
    const ok = await ctx.http().patch(api(`/organizations/${m.org.id}`)).set('Authorization', sa).send({ festivalTypes: ['DURGA_PUJA', 'NAVRATRI', 'DURGA_PUJA'] });
    expect(ok.status).toBe(200);
    // Re-sending the same list (e.g. the settings form) is harmless for the mandal.
    expect((await ctx.http().patch(api(`/organizations/${m.org.id}`)).set('Authorization', auth).send({ festivalTypes: ['NAVRATRI', 'DURGA_PUJA'], city: 'Pune' })).status).toBe(200);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}`)).set('Authorization', auth)).body.festivalTypes).toEqual(['DURGA_PUJA', 'NAVRATRI']);
    expect((await ctx.http().get(api(`/events/${m.event.id}`)).set('Authorization', auth)).body.organization.festivalTypes).toEqual(['DURGA_PUJA', 'NAVRATRI']);
  });

  it('venue details are validated, shown publicly with a directions link, and clearable', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const ev = (b: object) => ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', auth).send(b);
    expect((await ev({ venueMapUrl: 'https://evil.example/maps' })).status).toBe(400);
    expect((await ev({ venuePincode: '12345' })).status).toBe(400);
    expect((await ev({ venueLat: 123 })).status).toBe(400);
    const set = await ev({ location: 'Central Park pandal', venueAddress: 'Sector 1, Salt Lake', venueLandmark: 'FD Park gate 2', venuePincode: '700064', venueLat: 22.58, venueLng: 88.415, venueNotes: 'Enter from Gate 2', venueContactPhone: '9876543210' });
    expect(set.status).toBe(200);
    expect(set.body.venue).toMatchObject({ name: 'Central Park pandal', landmark: 'FD Park gate 2', pincode: '700064', mapUrl: expect.stringContaining('query=22.58%2C88.415') });
    const pub = await ctx.http().get(api(`/public/events/${m.event.id}`));
    expect(pub.body.venue).toMatchObject({ address: 'Sector 1, Salt Lake', notes: 'Enter from Gate 2', embedUrl: expect.stringContaining('output=embed') });
    const own = await ev({ venueMapUrl: 'https://maps.app.goo.gl/abc123' });
    expect(own.body.venue.mapUrl).toBe('https://maps.app.goo.gl/abc123');
    const cleared = await ev({ venueMapUrl: '', venueLat: null, venueLng: null, venueLandmark: '' });
    expect(cleared.body).toMatchObject({ venueMapUrl: null, venueLat: null, venueLandmark: null });
    expect(cleared.body.venue.mapUrl).toContain('Central%20Park%20pandal');
  });

  it('credit-status says how many passes the event can still issue; printing sponsors costs the mandal nothing', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    await ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { creditBalancePaise: 10_000, tokenPricePaise: 10_000, commissionBps: 100, sponsorPassFeePaise: 100 } });
    const before = await ctx.http().get(api(`/events/${m.event.id}/credit-status`)).set('Authorization', auth);
    expect(before.body).toMatchObject({ tokensLeft: 100, feePerPass: '1.00' });
    await ctx.prisma.sponsor.create({ data: { organizationId: m.org.id, eventId: m.event.id, name: 'Tanishq', tier: 'TITLE', showOnPasses: true } });
    const after = await ctx.http().get(api(`/events/${m.event.id}/credit-status`)).set('Authorization', auth);
    expect(after.body).toMatchObject({ tokensLeft: 100, feePerPass: '1.00', commissionPerPass: '1.00' });
  });
});
