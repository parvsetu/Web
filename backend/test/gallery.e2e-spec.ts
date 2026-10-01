/** Mandal logo/banner + festival photo gallery: uploads, sniffing, limits, privacy, quota. */
import { GALLERY_QUOTA_BYTES } from '../src/common/images/image-info';
import { assign, bearer, bootApp, fakeJpeg, fakePng, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Gallery & mandal branding (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  it('uploads, serves, replaces and removes the mandal logo/banner; public payloads expose the URLs', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const up = await ctx.http().put(api(`/organizations/${m.org.id}/logo`)).set('Authorization', auth).attach('file', fakePng(256, 256), 'logo.png');
    expect(up.status).toBe(200);
    expect(up.body.logoUrl).toMatch(new RegExp(`^/public/organizations/${m.org.id}/logo\\?v=\\d+$`));
    expect(up.body.bannerUrl).toBeNull();
    const img = await ctx.http().get(api(up.body.logoUrl));
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('immutable');

    const banner = await ctx.http().put(api(`/organizations/${m.org.id}/banner`)).set('Authorization', auth).attach('file', fakeJpeg(1920, 640), 'banner.jpg');
    expect(banner.status).toBe(200);
    // Public festival page and org detail carry both URLs, never bytes.
    const pub = await ctx.http().get(api(`/public/events/${m.event.id}`));
    expect(pub.body.organization).toMatchObject({ logoUrl: expect.stringContaining('/logo?v='), bannerUrl: expect.stringContaining('/banner?v=') });
    expect(pub.body.organization.logoKey).toBeUndefined();
    const org = await ctx.http().get(api(`/organizations/${m.org.id}`)).set('Authorization', auth);
    expect(org.body.logoUrl).toBe(up.body.logoUrl);

    // Replacing drops the old bytes.
    const before = await ctx.prisma.organization.findUniqueOrThrow({ where: { id: m.org.id } });
    const again = await ctx.http().put(api(`/organizations/${m.org.id}/logo`)).set('Authorization', auth).attach('file', fakePng(128, 128), 'logo2.png');
    expect(again.body.logoUrl).not.toBe(up.body.logoUrl);
    expect(await ctx.prisma.storedImage.findUnique({ where: { key: before.logoKey! } })).toBeNull();

    const del = await ctx.http().delete(api(`/organizations/${m.org.id}/logo`)).set('Authorization', auth);
    expect(del.body.logoUrl).toBeNull();
    expect((await ctx.http().get(api(`/public/organizations/${m.org.id}/logo`))).status).toBe(404);
  });

  it('rejects fake images, oversize files and non-admins', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const txt = await ctx.http().put(api(`/organizations/${m.org.id}/logo`)).set('Authorization', auth).attach('file', Buffer.from('<svg>not allowed</svg>'.repeat(10)), { filename: 'x.png', contentType: 'image/png' });
    expect(txt.status).toBe(400);
    const big = await ctx.http().put(api(`/organizations/${m.org.id}/logo`)).set('Authorization', auth).attach('file', fakePng(512, 512, 600 * 1024), 'big.png');
    expect(big.status).toBe(413);
    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    const denied = await ctx.http().put(api(`/organizations/${m.org.id}/logo`)).set('Authorization', bearer(ctx, viewer)).attach('file', fakePng(), 'l.png');
    expect([403, 404]).toContain(denied.status);
  });

  it('photo gallery: multi-upload with thumbs, private by default, publish, permissions, delete', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const up = await ctx.http().post(api(`/events/${m.event.id}/photos`)).set('Authorization', auth)
      .attach('files', fakeJpeg(1920, 1280, 50_000), 'a.jpg').attach('files', fakePng(1200, 900, 30_000), 'b.png')
      .attach('thumbs', fakeJpeg(400, 267, 5_000), 'a-t.jpg').attach('thumbs', fakeJpeg(400, 300, 4_000), 'b-t.jpg')
      .field('meta', JSON.stringify([{ caption: 'Aarti night', takenAt: '2026-10-03T19:20:00Z' }, {}]));
    expect(up.status).toBe(201);
    expect(up.body.items).toHaveLength(2);
    expect(up.body.items[0]).toMatchObject({ caption: 'Aarti night', isPublic: false, width: 1920, height: 1280, sizeBytes: 55_000, mimeType: 'image/jpeg', publicUrl: null });
    expect(up.body.usage).toMatchObject({ usedBytes: 89_000, quotaBytes: GALLERY_QUOTA_BYTES, photos: 2 });
    const [a] = up.body.items;

    const list = await ctx.http().get(api(`/events/${m.event.id}/photos`)).set('Authorization', auth);
    expect(list.body).toMatchObject({ total: 2, usage: { usedBytes: 89_000 } });

    // Private bytes need auth; the thumbnail is the small one.
    const thumb = await ctx.http().get(api(a.thumbUrl)).set('Authorization', auth);
    expect(thumb.status).toBe(200);
    expect(thumb.body.length).toBe(5_000);
    expect(thumb.headers['cache-control']).toContain('private');
    expect((await ctx.http().get(api(a.url))).status).toBe(401);
    expect((await ctx.http().get(api(`/public/photos/${a.id}/image`))).status).toBe(404);
    expect((await ctx.http().get(api(`/public/events/${m.event.id}/photos`))).body.total).toBe(0);

    // A report viewer may look but not upload or publish.
    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    const vAuth = bearer(ctx, viewer);
    expect((await ctx.http().get(api(`/events/${m.event.id}/photos`)).set('Authorization', vAuth)).status).toBe(200);
    expect((await ctx.http().post(api(`/events/${m.event.id}/photos`)).set('Authorization', vAuth).attach('files', fakePng(), 'x.png')).status).toBe(403);
    expect((await ctx.http().patch(api(`/events/${m.event.id}/photos/${a.id}`)).set('Authorization', vAuth).send({ isPublic: true })).status).toBe(403);
    // A gate volunteer can't even see them.
    const gate = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, gate.id, 'VOLUNTEER');
    expect((await ctx.http().get(api(`/events/${m.event.id}/photos`)).set('Authorization', bearer(ctx, gate))).status).toBe(403);
    // Another mandal's admin gets 404.
    const other = await makeOrgWithEvent(ctx.prisma);
    expect((await ctx.http().get(api(a.url)).set('Authorization', bearer(ctx, other.admin))).status).toBe(404);

    const pub = await ctx.http().patch(api(`/events/${m.event.id}/photos/${a.id}`)).set('Authorization', auth).send({ isPublic: true, caption: '  Sandhi puja  ' });
    expect(pub.body).toMatchObject({ isPublic: true, caption: 'Sandhi puja', publicUrl: `/public/photos/${a.id}/image` });
    const open = await ctx.http().get(api(`/public/photos/${a.id}/image?size=thumb`));
    expect(open.status).toBe(200);
    expect(open.headers['cache-control']).toContain('public');
    const strip = await ctx.http().get(api(`/public/events/${m.event.id}/photos`));
    expect(strip.body).toMatchObject({ total: 1, items: [{ id: a.id, caption: 'Sandhi puja' }] });

    // Mandal-wide gallery groups by year → festival.
    const sum = await ctx.http().get(api(`/organizations/${m.org.id}/photos/summary`)).set('Authorization', auth);
    expect(sum.body.years[0].events[0]).toMatchObject({ id: m.event.id, photos: 2, publicPhotos: 1 });
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/photos`)).query({ public: 'true' }).set('Authorization', auth)).body.total).toBe(1);

    const del = await ctx.http().delete(api(`/events/${m.event.id}/photos/${a.id}`)).set('Authorization', auth);
    expect(del.status).toBe(204);
    expect(await ctx.prisma.storedImage.count({ where: { organizationId: m.org.id } })).toBe(2); // the other photo + its thumb
    expect((await ctx.http().get(api(`/public/photos/${a.id}/image`))).status).toBe(404);
  });

  it('validates uploads and enforces the per-mandal storage quota (413)', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const send = () => ctx.http().post(api(`/events/${m.event.id}/photos`)).set('Authorization', auth);
    expect((await send().field('meta', '[]')).status).toBe(400); // no files
    expect((await send().attach('files', Buffer.from('GIF89a'.padEnd(200, 'x')), 'a.gif')).status).toBe(400);
    expect((await send().attach('files', fakePng(), 'a.png').attach('files', fakePng(), 'b.png').attach('thumbs', fakePng(400, 300), 'a-t.png')).status).toBe(400); // thumb count mismatch
    expect((await send().attach('files', fakePng(800, 600, 3.5 * 1024 * 1024), 'huge.png')).status).toBe(413);

    // Pretend the mandal already used almost all of its space.
    await ctx.prisma.eventPhoto.create({ data: {
      organizationId: m.org.id, eventId: m.event.id, imageKey: 'test/placeholder', mimeType: 'image/jpeg', width: 10, height: 10, sizeBytes: GALLERY_QUOTA_BYTES - 1000,
    } });
    const full = await send().attach('files', fakePng(800, 600, 5000), 'small.png');
    expect(full.status).toBe(413);
    expect(full.body.code).toBe('GALLERY_QUOTA_EXCEEDED');
    expect(await ctx.prisma.eventPhoto.count({ where: { eventId: m.event.id } })).toBe(1);
  });
});
