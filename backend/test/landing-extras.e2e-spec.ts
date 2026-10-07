/** Landing page extras: achievements (trophies) CRUD + images + public output, and the section layout editor. */
import { assign, bearer, bootApp, fakePng, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Landing achievements & layout (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  async function mandal(active = true) {
    const m = await makeOrgWithEvent(ctx.prisma);
    if (active) await ctx.prisma.landingPage.create({ data: { organizationId: m.org.id, paidUntil: new Date(Date.now() + 30 * 86400000) } });
    return { ...m, auth: bearer(ctx, m.admin) };
  }

  it('achievements: create/validate, default newest-first order, reorder, hide, image (quota), delete; public output', async () => {
    const m = await mandal();
    const base = api(`/organizations/${m.org.id}/achievements`);
    const mk = (body: Record<string, unknown>) => ctx.http().post(base).set('Authorization', m.auth).send(body);
    expect((await mk({ title: 'x'.repeat(121) })).status).toBe(400);
    expect((await mk({ title: 'Best pandal', icon: 'ROCKET' })).status).toBe(400);
    expect((await mk({ title: 'Best pandal', year: 1700 })).status).toBe(400);
    const a1 = (await mk({ title: 'Community Service Trophy', year: 2023, awardedBy: 'Rotary Club of Pune', icon: 'CROWN' })).body;
    const a2 = (await mk({ title: 'Best Pandal Decoration', year: 2025, awardedBy: 'Pune Municipal Corporation' })).body;
    const a3 = (await mk({ title: 'Eco-friendly Ganesh Award', year: 2024, icon: 'MEDAL', description: 'Shadu clay murti' })).body;
    expect(a2).toMatchObject({ icon: 'TROPHY', isVisible: true, imageUrl: null });

    let list = (await ctx.http().get(base).set('Authorization', m.auth)).body;
    expect(list.items.map((a: { id: string }) => a.id)).toEqual([a2.id, a3.id, a1.id]);
    expect(list.customOrder).toBe(false);

    // Reorder: must be exactly this mandal's ids.
    expect((await ctx.http().put(`${base}/order`).set('Authorization', m.auth).send({ ids: [a1.id, a2.id] })).status).toBe(400);
    list = (await ctx.http().put(`${base}/order`).set('Authorization', m.auth).send({ ids: [a1.id, a3.id, a2.id] })).body;
    expect(list.items.map((a: { id: string }) => a.id)).toEqual([a1.id, a3.id, a2.id]);
    expect(list.customOrder).toBe(true);
    // A new one after a custom order goes to the end.
    const a4 = (await mk({ title: 'Cleanest Venue', year: 2026, icon: 'STAR' })).body;
    expect((await ctx.http().get(base).set('Authorization', m.auth)).body.items.at(-1).id).toBe(a4.id);

    // Image: counts toward the quota; public bytes only while visible.
    const usage0 = (await ctx.http().get(api(`/organizations/${m.org.id}/photos/summary`)).set('Authorization', m.auth)).body.usage.usedBytes;
    const img = await ctx.http().put(`${base}/${a1.id}/image`).set('Authorization', m.auth).attach('file', fakePng(1200, 900, 50_000), 'a.png').attach('thumb', fakePng(400, 300, 6_000), 't.png');
    expect(img.status).toBe(200);
    expect(img.body.imageUrl).toMatch(new RegExp(`^/public/achievements/${a1.id}/image\\?v=\\d+$`));
    const usage1 = (await ctx.http().get(api(`/organizations/${m.org.id}/photos/summary`)).set('Authorization', m.auth)).body.usage.usedBytes;
    expect(usage1 - usage0).toBe(56_000);
    expect((await ctx.http().get(api(img.body.thumbUrl))).status).toBe(200);
    expect((await ctx.http().put(`${base}/${a1.id}/image`).set('Authorization', m.auth).attach('file', Buffer.from('not an image'.repeat(10)), 'x.png')).status).toBe(400);

    const upd = await ctx.http().patch(`${base}/${a4.id}`).set('Authorization', m.auth).send({ isVisible: false, awardedBy: null });
    expect(upd.body).toMatchObject({ isVisible: false, awardedBy: null });

    const pub = (await ctx.http().get(api(`/public/landing/${m.org.slug}`))).body;
    expect(pub.achievements.map((a: { id: string }) => a.id)).toEqual([a1.id, a3.id, a2.id]);
    expect(pub.achievements[0]).toMatchObject({ title: 'Community Service Trophy', year: 2023, awardedBy: 'Rotary Club of Pune', icon: 'CROWN' });
    expect(pub.achievements[0].isVisible).toBeUndefined();

    await ctx.http().patch(`${base}/${a1.id}`).set('Authorization', m.auth).send({ isVisible: false });
    expect((await ctx.http().get(api(img.body.imageUrl))).status).toBe(404);

    // Volunteers / report viewers can't edit; strangers don't see the mandal.
    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    expect([403, 404]).toContain((await ctx.http().post(base).set('Authorization', bearer(ctx, viewer)).send({ title: 'Nope' })).status);
    expect((await ctx.http().delete(`${base}/${a1.id}`).set('Authorization', bearer(ctx, await makeUser(ctx.prisma)))).status).toBe(404);

    const key = (await ctx.prisma.achievement.findUniqueOrThrow({ where: { id: a1.id } })).imageKey!;
    expect((await ctx.http().delete(`${base}/${a1.id}`).set('Authorization', m.auth)).status).toBe(204);
    expect(await ctx.prisma.storedImage.findUnique({ where: { key } })).toBeNull();
    const audits = (await ctx.prisma.auditLog.findMany({ where: { organizationId: m.org.id, entityType: 'Achievement' } })).map((a) => a.action);
    expect(audits).toEqual(expect.arrayContaining(['achievement.created', 'achievement.reordered', 'achievement.image_updated', 'achievement.updated', 'achievement.deleted']));
  });

  it('layout: default, validation (unknown dropped, hero first, bad variant 400), public page returns it in saved order', async () => {
    const m = await mandal();
    const url = api(`/organizations/${m.org.id}/landing-page/layout`);
    const d = (await ctx.http().get(url).set('Authorization', m.auth)).body;
    expect(d.customized).toBe(false);
    expect(d.sections[0]).toEqual({ id: 'hero', visible: true, variant: 'DEFAULT' });
    expect(d.catalog.gallery).toEqual(['GRID', 'CAROUSEL']);

    expect((await ctx.http().put(url).set('Authorization', m.auth).send({ sections: [{ id: 'trophies', visible: true, variant: 'CAROUSEL' }] })).status).toBe(400);
    expect((await ctx.http().put(url).set('Authorization', m.auth).send({ sections: [{ id: 'gallery', visible: true }, { id: 'gallery', visible: false }] })).status).toBe(400);
    expect((await ctx.http().put(url).set('Authorization', m.auth).send({ sections: [{ id: 'gallery', visible: 'yes' }] })).status).toBe(400);
    expect((await ctx.http().put(url).set('Authorization', m.auth).send({ sections: [], extra: 1 })).status).toBe(400);

    const saved = await ctx.http().put(url).set('Authorization', m.auth).send({ sections: [
      { id: 'trophies', visible: true, variant: 'GRID' },
      { id: 'mysteryWidget', visible: true },
      { id: 'hero', visible: false, variant: 'DEFAULT' },
      { id: 'reviews', visible: true, variant: 'SLIDER' },
      { id: 'gallery', visible: false, variant: 'CAROUSEL' },
      { id: 'upcoming', visible: true, variant: 'LIST' },
    ] });
    expect(saved.status).toBe(200);
    const ids = saved.body.sections.map((s: { id: string }) => s.id);
    expect(ids.slice(0, 5)).toEqual(['hero', 'trophies', 'reviews', 'gallery', 'upcoming']);
    expect(ids).not.toContain('mysteryWidget');
    expect(saved.body.sections[0].visible).toBe(true);
    expect(new Set(ids).size).toBe(10); // missing sections appended
    expect(saved.body.customized).toBe(true);

    const pub = (await ctx.http().get(api(`/public/landing/${m.org.slug}`))).body;
    expect(pub.layout.slice(0, 5)).toEqual([
      { id: 'hero', visible: true, variant: 'DEFAULT' },
      { id: 'trophies', visible: true, variant: 'GRID' },
      { id: 'reviews', visible: true, variant: 'SLIDER' },
      { id: 'gallery', visible: false, variant: 'CAROUSEL' },
      { id: 'upcoming', visible: true, variant: 'LIST' },
    ]);
    // Existing content endpoint still works and reports the layout; it doesn't accept one.
    const st = (await ctx.http().get(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth)).body;
    expect(st.content.layout[1]).toMatchObject({ id: 'trophies', variant: 'GRID' });
    expect((await ctx.http().put(api(`/organizations/${m.org.id}/landing-page`)).set('Authorization', m.auth).send({ layout: [] })).status).toBe(400);
    expect((await ctx.prisma.auditLog.findFirst({ where: { organizationId: m.org.id, action: 'landing.layout_updated' } }))).not.toBeNull();

    // Only page editors can save a layout.
    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    expect([403, 404]).toContain((await ctx.http().put(url).set('Authorization', bearer(ctx, viewer)).send({ sections: [] })).status);
  });
});
