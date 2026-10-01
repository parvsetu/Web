/** Paid mandal landing page (/m/<slug>): pricing, demo purchase, expiry, super-admin grant/revoke, validation. */
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Mandal landing page (e2e)', () => {
  let ctx: TestCtx;
  let saUser: Awaited<ReturnType<typeof makeUser>>;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  const prevDemo = process.env.BOOKING_DEMO_PAYMENTS;

  beforeAll(async () => {
    process.env.BOOKING_DEMO_PAYMENTS = 'true';
    ctx = await bootApp();
    saUser = await makeUser(ctx.prisma, { isSuperAdmin: true });
    sa = bearer(ctx, saUser);
  });
  afterAll(async () => {
    process.env.BOOKING_DEMO_PAYMENTS = prevDemo;
    await ctx.app.close();
  });

  async function mandal() {
    const m = await makeOrgWithEvent(ctx.prisma);
    return { ...m, auth: bearer(ctx, m.admin) };
  }

  it('buy (demo) → active → public page returns content; revenue shows in the platform summary', async () => {
    const m = await mandal();
    await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', sa).send({ landingPagePrice: '1500' });
    const st0 = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth);
    expect(st0.body).toMatchObject({ state: 'NOT_ACTIVE', price: '1500.00', paidUntil: null, publicPath: `/m/${m.org.slug}` });
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}`))).status).toBe(404);

    const ed = await ctx.http().put(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth).send({
      headline: 'Pune’s grandest pandal', about: 'Since 1972.\nBhog for all.', highlights: ['Live dhak', 'Bhog daily'],
      instagramUrl: 'https://www.instagram.com/janutsav', whatsappNumber: '98765 43210', themeColor: 'peacock', featuredEventIds: [m.event.id],
    });
    expect(ed.status).toBe(200);
    expect(ed.body).toMatchObject({ whatsappNumber: '919876543210', themeColor: 'peacock', highlights: ['Live dhak', 'Bhog daily'] });

    const before = (await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa)).body;
    const p = await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases`)).set('Authorization', m.auth);
    expect(p.status).toBe(201);
    expect(p.body).toMatchObject({ amount: '1500.00', status: 'PENDING' });
    const paid = await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases/${p.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' });
    expect(paid.body.status).toBe('PAID');
    // Replay is idempotent — never extends twice.
    await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases/${p.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' });
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth);
    expect(st.body.state).toBe('ACTIVE');
    const days = (new Date(st.body.paidUntil).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(364);
    expect(days).toBeLessThan(367);

    const pub = await ctx.http().get(api(`/public/landing/${m.org.slug}`));
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({
      headline: 'Pune’s grandest pandal', theme: 'peacock', organization: { name: m.org.name, logoUrl: null },
      social: { instagram: 'https://www.instagram.com/janutsav', whatsapp: 'https://wa.me/919876543210' },
      upcoming: [{ id: m.event.id, name: m.event.name }],
    });
    // Public festival page now links the mandal name to its landing page.
    expect((await ctx.http().get(api(`/public/events/${m.event.id}`))).body.organization.landingSlug).toBe(m.org.slug);

    const after = (await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa)).body;
    expect(Number(after.landingPageEarned) - Number(before.landingPageEarned)).toBe(1500);
    expect(Number(after.totalEarned) - Number(before.totalEarned)).toBe(1500);

    // Renewing while active extends from the current expiry.
    const p2 = await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases`)).set('Authorization', m.auth);
    await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases/${p2.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' });
    const lp = await ctx.prisma.landingPage.findUniqueOrThrow({ where: { organizationId: m.org.id } });
    expect((lp.paidUntil!.getTime() - Date.now()) / 86400000).toBeGreaterThan(729);

    // Mandal can switch it off; then it 404s.
    await ctx.http().put(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth).send({ enabled: false });
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}`))).status).toBe(404);
  });

  it('expired → 404; a failed payment changes nothing; the editor preview still works', async () => {
    const m = await mandal();
    await ctx.prisma.landingPage.create({ data: { organizationId: m.org.id, paidUntil: new Date(Date.now() - 60_000), headline: 'Old' } });
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}`))).status).toBe(404);
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth);
    expect(st.body.state).toBe('EXPIRED');
    const p = await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases`)).set('Authorization', m.auth);
    await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases/${p.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'fail' });
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth)).body.state).toBe('EXPIRED');
    const prev = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page/preview`)).set('Authorization', m.auth);
    expect(prev.body).toMatchObject({ headline: 'Old', preview: true });
    // Renewing after expiry counts from now.
    const p2 = await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases`)).set('Authorization', m.auth);
    await ctx.http().post(api(`/organizations/${m.org.id}/landing-page/purchases/${p2.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' });
    const lp = await ctx.prisma.landingPage.findUniqueOrThrow({ where: { organizationId: m.org.id } });
    expect((lp.paidUntil!.getTime() - Date.now()) / 86400000).toBeLessThan(367);
  });

  it('the mandal cannot set paidUntil; only the super admin grants/revokes (audited)', async () => {
    const m = await mandal();
    const hack = await ctx.http().put(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth).send({ paidUntil: '2099-01-01T00:00:00Z' });
    expect(hack.status).toBe(400);
    expect((await ctx.http().post(api(`/platform/landing-pages/${m.org.id}/grant`)).set('Authorization', m.auth).send({ years: 1, reason: 'please' })).status).toBe(403);

    const g = await ctx.http().post(api(`/platform/landing-pages/${m.org.id}/grant`)).set('Authorization', sa).send({ years: 2, reason: 'Launch partner' });
    expect(g.status).toBe(200);
    expect(g.body.state).toBe('ACTIVE');
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}`))).status).toBe(200);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { organizationId: m.org.id, action: 'landing.granted' } });
    expect(audit).toMatchObject({ actorId: saUser.id, reason: 'Launch partner' });
    // A grant is not revenue.
    expect(await ctx.prisma.landingPurchase.count({ where: { organizationId: m.org.id } })).toBe(0);

    const r = await ctx.http().post(api(`/platform/landing-pages/${m.org.id}/revoke`)).set('Authorization', sa).send({ reason: 'Requested by mandal' });
    expect(r.body.state).toBe('EXPIRED');
    expect((await ctx.http().get(api(`/public/landing/${m.org.slug}`))).status).toBe(404);
    expect((await ctx.http().post(api(`/platform/landing-pages/${m.org.id}/grant`)).set('Authorization', sa).send({ reason: 'no amount' })).status).toBe(400);
    const until = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const g2 = await ctx.http().post(api(`/platform/landing-pages/${m.org.id}/grant`)).set('Authorization', sa).send({ until, reason: 'Festival season' });
    expect(g2.body.paidUntil.slice(0, 10)).toBe(until);
  });

  it('validates social links, featured festivals and photos', async () => {
    const m = await mandal();
    const put = (body: object) => ctx.http().put(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth).send(body);
    expect((await put({ instagramUrl: 'http://instagram.com/x' })).status).toBe(400); // not https
    expect((await put({ instagramUrl: 'https://evil.com/instagram.com' })).status).toBe(400);
    expect((await put({ facebookUrl: 'https://instagram.com/x' })).status).toBe(400);
    expect((await put({ youtubeUrl: 'https://youtu.be/abc' })).status).toBe(200);
    expect((await put({ facebookUrl: 'https://m.facebook.com/jan' })).status).toBe(200);
    expect((await put({ whatsappNumber: 'call me' })).status).toBe(400);
    expect((await put({ highlights: ['1', '2', '3', '4', '5', '6', '7'] })).status).toBe(400);
    expect((await put({ themeColor: 'neon' })).status).toBe(400);
    const other = await makeOrgWithEvent(ctx.prisma);
    expect((await put({ featuredEventIds: [other.event.id] })).status).toBe(400);
    const photo = await ctx.prisma.eventPhoto.create({ data: { organizationId: m.org.id, eventId: m.event.id, imageKey: 'k/1', mimeType: 'image/jpeg', width: 1, height: 1, sizeBytes: 1 } });
    expect((await put({ photoIds: [photo.id] })).status).toBe(400); // private photo
    await ctx.prisma.eventPhoto.update({ where: { id: photo.id }, data: { isPublic: true } });
    expect((await put({ photoIds: [photo.id] })).status).toBe(200);
    expect((await put({ instagramUrl: '' })).body.instagramUrl).toBeNull();
  });
});
