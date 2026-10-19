/** Art gallery: display / for-sale artworks, images + quota, public view, enquiries, sold, permissions. */
import { bearer, bootApp, fakeJpeg, makeOrgWithEvent, makeVolunteer, TestCtx, uniqueMobile } from './helpers';

describe('Art gallery (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  async function festival(opts: Parameters<typeof makeOrgWithEvent>[1] = {}) {
    const m = await makeOrgWithEvent(ctx.prisma, opts);
    return { ...m, auth: bearer(ctx, m.admin) };
  }
  const art = (extra: Record<string, unknown> = {}) => ({
    title: 'Maa Durga in Kalighat style', artistName: 'Sudipta Pal', medium: 'Acrylic on canvas', widthCm: '60', heightCm: '90', year: 2026,
    mode: 'SALE', price: '18000', artistInstagram: '@sudipta.art', ...extra,
  });

  it('creates display and for-sale artworks; a sale piece needs a price; display pieces never carry one', async () => {
    const f = await festival();
    const sale = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art());
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({ mode: 'SALE', price: '18000.00', saleStatus: 'AVAILABLE', widthCm: '60', heightCm: '90', artistInstagram: 'https://www.instagram.com/sudipta.art/' });
    expect((await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art({ price: '' }))).status).toBe(400);
    const display = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art({ title: 'Pandal mural', mode: 'DISPLAY', price: '5000', saleStatus: 'SOLD' }));
    expect(display.body).toMatchObject({ mode: 'DISPLAY', price: null, saleStatus: 'AVAILABLE' });
    // Switching a sale piece to display drops price and status.
    const sw = await ctx.http().patch(api(`/events/${f.event.id}/artworks/${sale.body.id}`)).set('Authorization', f.auth).send({ mode: 'DISPLAY' });
    expect(sw.body).toMatchObject({ mode: 'DISPLAY', price: null });
  });

  it('shows only published artworks of public festivals, with public image URLs', async () => {
    const f = await festival();
    const a = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art());
    await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art({ title: 'Hidden', isPublished: false })).expect(201);
    const img = await ctx.http().put(api(`/events/${f.event.id}/artworks/${a.body.id}/image`)).set('Authorization', f.auth)
      .attach('file', fakeJpeg(1200, 1600, 9000), 'art.jpg').attach('thumb', fakeJpeg(300, 400, 2000), 'thumb.jpg');
    expect(img.status).toBe(200);
    expect(img.body).toMatchObject({ imageWidth: 1200, imageHeight: 1600, imageSizeBytes: 11000 });
    const pub = await ctx.http().get(api(`/public/events/${f.event.id}/artworks`));
    expect(pub.body.map((x: { title: string }) => x.title)).toEqual(['Maa Durga in Kalighat style']);
    expect(pub.body[0].isPublished).toBeUndefined();
    expect((await ctx.http().get(api(pub.body[0].thumbUrl))).status).toBe(200);
    const usage = await ctx.http().get(api(`/organizations/${f.org.id}/photos/summary`)).set('Authorization', f.auth);
    expect(usage.body.usage?.breakdown?.artworkBytes ?? usage.body.breakdown?.artworkBytes).toBe(11000);
    // Unpublish → public image gone.
    await ctx.http().patch(api(`/events/${f.event.id}/artworks/${a.body.id}`)).set('Authorization', f.auth).send({ isPublished: false }).expect(200);
    expect((await ctx.http().get(api(pub.body[0].thumbUrl))).status).toBe(404);
    const draft = await festival({ approvalStatus: 'DRAFT', status: 'DRAFT' });
    expect((await ctx.http().get(api(`/public/events/${draft.event.id}/artworks`))).status).toBe(404);
    // Delete removes the stored bytes.
    await ctx.http().delete(api(`/events/${f.event.id}/artworks/${a.body.id}`)).set('Authorization', f.auth).expect(204);
    expect(await ctx.prisma.storedImage.count({ where: { key: { startsWith: `event/${f.event.id}/art` } } })).toBe(0);
  });

  it('takes buyer enquiries for sale pieces only, deduplicates, and the mandal works them and marks sold', async () => {
    const f = await festival();
    const sale = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art());
    const display = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art({ mode: 'DISPLAY', title: 'Mural' }));
    const phone = uniqueMobile();
    const e1 = await ctx.http().post(api(`/public/artworks/${sale.body.id}/enquiries`)).send({ name: 'Rahul Mehta', phone, message: 'Can I see it on Saturday?' });
    expect(e1.body).toEqual({ ok: true });
    expect((await ctx.http().post(api(`/public/artworks/${sale.body.id}/enquiries`)).send({ name: 'Rahul Mehta', phone })).body).toEqual({ ok: true, duplicate: true });
    expect((await ctx.http().post(api(`/public/artworks/${display.body.id}/enquiries`)).send({ name: 'X Y', phone })).body.code).toBe('NOT_FOR_SALE');
    // Honeypot: accepted silently, nothing stored.
    await ctx.http().post(api(`/public/artworks/${sale.body.id}/enquiries`)).send({ name: 'Bot', phone: uniqueMobile(), website: 'http://spam' }).expect(201);

    const list = await ctx.http().get(api(`/events/${f.event.id}/artwork-enquiries`)).set('Authorization', f.auth);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({ name: 'Rahul Mehta', phone, status: 'NEW', artwork: { title: 'Maa Durga in Kalighat style', price: '18000.00' } });
    const counts = await ctx.http().get(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth);
    expect(counts.body.find((a: { id: string }) => a.id === sale.body.id)).toMatchObject({ enquiries: 1, newEnquiries: 1 });
    await ctx.http().patch(api(`/events/${f.event.id}/artwork-enquiries/${list.body.items[0].id}`)).set('Authorization', f.auth).send({ status: 'CONTACTED', note: 'Called, visiting Sat' }).expect(200);

    const sold = await ctx.http().patch(api(`/events/${f.event.id}/artworks/${sale.body.id}`)).set('Authorization', f.auth).send({ saleStatus: 'SOLD' });
    expect(sold.body).toMatchObject({ saleStatus: 'SOLD', soldAt: expect.any(String) });
    expect((await ctx.http().post(api(`/public/artworks/${sale.body.id}/enquiries`)).send({ name: 'Late Buyer', phone: uniqueMobile() })).body.code).toBe('ARTWORK_SOLD');
    const back = await ctx.http().patch(api(`/events/${f.event.id}/artworks/${sale.body.id}`)).set('Authorization', f.auth).send({ saleStatus: 'AVAILABLE' });
    expect(back.body).toMatchObject({ saleStatus: 'AVAILABLE', soldAt: null });
  });

  it('keeps enquiries (personal data) and editing to gallery managers; other mandals see nothing', async () => {
    const f = await festival();
    const a = await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', f.auth).send(art());
    const gate = bearer(ctx, await makeVolunteer(ctx.prisma, f.event.id, 'VOLUNTEER'));
    expect((await ctx.http().post(api(`/events/${f.event.id}/artworks`)).set('Authorization', gate).send(art())).status).toBe(403);
    expect((await ctx.http().get(api(`/events/${f.event.id}/artwork-enquiries`)).set('Authorization', gate)).status).toBe(403);
    const treasurer = bearer(ctx, await makeVolunteer(ctx.prisma, f.event.id, 'TREASURER'));
    expect((await ctx.http().get(api(`/events/${f.event.id}/artworks`)).set('Authorization', treasurer)).status).toBe(200);
    expect((await ctx.http().get(api(`/events/${f.event.id}/artwork-enquiries`)).set('Authorization', treasurer)).status).toBe(403);
    const other = await festival();
    expect((await ctx.http().get(api(`/events/${f.event.id}/artworks`)).set('Authorization', other.auth)).status).toBe(404);
    expect((await ctx.http().patch(api(`/events/${other.event.id}/artworks/${a.body.id}`)).set('Authorization', other.auth).send({ title: 'Hijack' })).status).toBe(404);
  });
});
