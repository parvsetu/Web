/** Sponsors (partners' banners), public festival page, passes issued with a donation. */
import { DateTime } from 'luxon';
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

// 1×1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Sponsors, public page, donation passes (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  it('admins manage sponsors with validated logos; they appear on the public page in tier order', async () => {
    const { org, event, admin } = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, admin);
    const gold = await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', auth)
      .send({ name: 'Tanishq', tier: 'GOLD', tagline: 'Jewellery partner', bannerText: 'Festive offers at Tanishq Salt Lake', websiteUrl: 'https://www.tanishq.co.in', logoDataUrl: PNG });
    expect(gold.status).toBe(201);
    expect(gold.body.logoUrl).toMatch(/^\/public\/sponsors\//);
    await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', auth).send({ name: 'Local Sweets', tier: 'PARTNER', eventId: event.id });
    await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', auth).send({ name: 'Title Co', tier: 'TITLE' });

    // A fake "image" (HTML bytes labelled as PNG) is refused, as is javascript: URL.
    const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
    expect((await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', auth).send({ name: 'Bad', logoDataUrl: fake })).status).toBe(400);
    expect((await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', auth).send({ name: 'Bad', websiteUrl: 'javascript:alert(1)' })).status).toBe(400);

    const logo = await ctx.http().get(api(gold.body.logoUrl.split('?')[0]));
    expect(logo.headers['content-type']).toBe('image/png');

    // Public page hidden while DRAFT
    await ctx.prisma.event.update({ where: { id: event.id }, data: { status: 'DRAFT' } });
    expect((await ctx.http().get(api(`/public/events/${event.id}`))).status).toBe(404);
    await ctx.prisma.event.update({ where: { id: event.id }, data: { status: 'ACTIVE' } });
    const pub = await ctx.http().get(api(`/public/events/${event.id}`));
    expect(pub.body.sponsors.map((s: { name: string }) => s.name)).toEqual(['Title Co', 'Tanishq', 'Local Sweets']);

    // Volunteers can't edit sponsors.
    const v = bearer(ctx, await makeVolunteer(ctx.prisma, event.id));
    expect((await ctx.http().post(api(`/organizations/${org.id}/sponsors`)).set('Authorization', v).send({ name: 'X' })).status).toBe(404);
    expect((await ctx.http().get(api(`/events/${event.id}/sponsors`)).set('Authorization', v)).body).toHaveLength(3);
  });

  it('a donation can issue per-person passes atomically; a full slot records nothing', async () => {
    const { event, admin } = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, admin);
    const before = await ctx.prisma.donation.count({ where: { eventId: event.id } });
    const d = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth)
      .send({ donorName: 'Ravi', amount: '1100', method: 'CASH', passes: { durationHours: 6, visitorCount: 3, perPerson: true } });
    expect(d.status).toBe(201);
    expect(d.body.passes).toHaveLength(3);
    expect(d.body.passes[0].qrPayload).toMatch(/^PSQR1\./);

    const date = DateTime.now().setZone('Asia/Kolkata').toISODate();
    const tiny = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', auth).send({ label: 'Tiny', startTime: '00:00', endTime: '23:59', capacity: 1 });
    const full = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth)
      .send({ donorName: 'Sita', amount: '500', method: 'CASH', passes: { timeSlotId: tiny.body.id, date, visitorCount: 2 } });
    expect(full.status).toBe(409);
    expect(await ctx.prisma.donation.count({ where: { eventId: event.id } })).toBe(before + 1);

    // Treasurer (no TOKEN_CREATE) can record donations but not passes.
    const treasurer = bearer(ctx, await makeVolunteer(ctx.prisma, event.id, 'TREASURER'));
    expect((await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', treasurer)
      .send({ donorName: 'X', amount: '10', method: 'CASH', passes: { durationHours: 3 } })).status).toBe(403);
  });
});
