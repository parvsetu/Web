/** Festival programme / line-up: day-wise items, guests, posters, video links, public visibility, isolation. */
import { normaliseInstagramProfile, videoLink } from '../src/modules/programme/programme.rules';
import { bearer, bootApp, fakeJpeg, fakePng, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

describe('Festival programme (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const addDays = (d: Date, n: number) => ymd(new Date(d.getTime() + n * 86400000));

  async function festival(opts: Parameters<typeof makeOrgWithEvent>[1] = {}) {
    const m = await makeOrgWithEvent(ctx.prisma, opts);
    return { ...m, auth: bearer(ctx, m.admin), day1: ymd(m.event.startDate), day2: addDays(m.event.startDate, 1) };
  }

  const item = (date: string, extra: Record<string, unknown> = {}) => ({
    date, startTime: '19:30', endTime: '22:00', title: 'Navratri Utsav with Falguni Pathak', category: 'PERFORMANCE',
    setting: 'OUTDOOR', stage: 'Main ground', language: 'Gujarati, Hindi', ageLimit: 'All ages',
    videoUrl: 'https://www.instagram.com/reel/DPPNa8KkrK4/?igsh=abc', isHeadline: true,
    guests: [{ name: 'Falguni Pathak', role: 'Singer', instagramUrl: '@falgunipathak12' }],
    ...extra,
  });

  it('normalises video and Instagram links', () => {
    expect(videoLink('https://youtu.be/dQw4w9WgXcQ?t=3')).toMatchObject({ provider: 'YOUTUBE', embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    expect(videoLink('youtube.com/shorts/dQw4w9WgXcQ')?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(videoLink('https://www.instagram.com/reels/DPPNa8KkrK4/')).toMatchObject({ provider: 'INSTAGRAM', url: 'https://www.instagram.com/reel/DPPNa8KkrK4/' });
    expect(videoLink('https://evil.example/reel/DPPNa8KkrK4')).toBeNull();
    expect(videoLink('javascript:alert(1)')).toBeNull();
    expect(normaliseInstagramProfile('https://instagram.com/falgunipathak12?hl=en')).toBe('https://www.instagram.com/falgunipathak12/');
    expect(() => normaliseInstagramProfile('https://instagram.com/reel/abc')).toThrow();
  });

  it('builds a day-wise programme with guests, day titles and a star line-up', async () => {
    const f = await festival();
    const day = await ctx.http().put(api(`/events/${f.event.id}/programme/days/${f.day1}`)).set('Authorization', f.auth).send({ title: 'Maha Shashthi', subtitle: 'Bodhon at dusk' });
    expect(day.status).toBe(200);
    const a = await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1));
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({
      setting: 'OUTDOOR', videoUrl: 'https://www.instagram.com/reel/DPPNa8KkrK4/',
      video: { provider: 'INSTAGRAM', embedUrl: 'https://www.instagram.com/reel/DPPNa8KkrK4/embed' },
      guests: [{ name: 'Falguni Pathak', instagramUrl: 'https://www.instagram.com/falgunipathak12/' }],
    });
    await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth)
      .send({ date: f.day1, startTime: '06:00', title: 'Morning puja', category: 'PUJA', setting: 'INDOOR' }).expect(201);
    await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth)
      .send({ date: f.day2, startTime: '18:00', title: 'Draft rehearsal', isPublished: false }).expect(201);

    const pub = await ctx.http().get(api(`/public/events/${f.event.id}/programme`));
    expect(pub.status).toBe(200);
    expect(pub.body.days).toHaveLength(1); // day 2 only has an unpublished item
    expect(pub.body.days[0]).toMatchObject({ date: f.day1, dayNumber: 1, title: 'Maha Shashthi' });
    expect(pub.body.days[0].items.map((i: { title: string }) => i.title)).toEqual(['Morning puja', 'Navratri Utsav with Falguni Pathak']);
    expect(pub.body.days[0].items[0].setting).toBe('INDOOR');
    expect(pub.body.days[0].items[1].isPublished).toBeUndefined();
    expect(pub.body.headliners).toEqual([expect.objectContaining({ name: 'Falguni Pathak', role: 'Singer', date: f.day1 })]);

    const admin = await ctx.http().get(api(`/events/${f.event.id}/programme`)).set('Authorization', f.auth);
    expect(admin.body.days.length).toBeGreaterThanOrEqual(7);
    expect(admin.body.days[1].items[0]).toMatchObject({ title: 'Draft rehearsal', isPublished: false });
  });

  it('rejects dates outside the festival, bad video links and bad times', async () => {
    const f = await festival();
    const outside = addDays(f.event.endDate, 1);
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(outside))).status).toBe(400);
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1, { videoUrl: 'https://vimeo.com/1' }))).status).toBe(400);
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1, { endTime: '19:30' }))).status).toBe(400);
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1, { setting: 'SPACE' }))).status).toBe(400);
    expect((await ctx.http().put(api(`/events/${f.event.id}/programme/days/${outside}`)).set('Authorization', f.auth).send({ title: 'x' })).status).toBe(400);
  });

  it('updates the guest list in place, keeps photos by id and deletes dropped guests\' photos', async () => {
    const f = await festival();
    const a = await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth)
      .send(item(f.day1, { guests: [{ name: 'Singer A' }, { name: 'Singer B' }] }));
    const [ga, gb] = a.body.guests;
    const pa = await ctx.http().put(api(`/events/${f.event.id}/programme/items/${a.body.id}/guests/${ga.id}/photo`)).set('Authorization', f.auth).attach('file', fakePng(300, 300), 'a.png');
    expect(pa.status).toBe(200);
    await ctx.http().put(api(`/events/${f.event.id}/programme/items/${a.body.id}/guests/${gb.id}/photo`)).set('Authorization', f.auth).attach('file', fakePng(300, 300), 'b.png').expect(200);
    const bKey = (await ctx.prisma.programmeGuest.findUniqueOrThrow({ where: { id: gb.id } })).photoKey!;

    const up = await ctx.http().patch(api(`/events/${f.event.id}/programme/items/${a.body.id}`)).set('Authorization', f.auth)
      .send({ guests: [{ id: ga.id, name: 'Singer A', role: 'Lead' }, { name: 'Dhaki group' }] });
    expect(up.status).toBe(200);
    expect(up.body.guests).toEqual([
      expect.objectContaining({ id: ga.id, role: 'Lead', photoUrl: expect.stringContaining(`/programme/images/photo/${ga.id}`) }),
      expect.objectContaining({ name: 'Dhaki group', photoUrl: null }),
    ]);
    expect(await ctx.prisma.storedImage.findUnique({ where: { key: bKey } })).toBeNull();

    // A guest id from another item can't be smuggled in.
    const other = await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day2));
    const smuggle = await ctx.http().patch(api(`/events/${f.event.id}/programme/items/${a.body.id}`)).set('Authorization', f.auth)
      .send({ guests: [{ id: other.body.guests[0].id, name: 'x' }] });
    expect(smuggle.status).toBe(400);
  });

  it('serves posters publicly only for published items of public festivals; counts them toward the quota', async () => {
    const f = await festival();
    const a = await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1));
    const p = await ctx.http().put(api(`/events/${f.event.id}/programme/items/${a.body.id}/poster`)).set('Authorization', f.auth).attach('file', fakeJpeg(1080, 1350, 8000), 'poster.jpg');
    expect(p.status).toBe(200);
    const pub = await ctx.http().get(api(`/public/events/${f.event.id}/programme`));
    const posterUrl = pub.body.days[0].items[0].posterUrl as string;
    expect(posterUrl).toMatch(/^\/public\/programme\/items\/.+\/poster\?v=\d+$/);
    expect((await ctx.http().get(api(posterUrl))).status).toBe(200);
    expect((await ctx.http().get(api(p.body.posterUrl)).set('Authorization', f.auth)).status).toBe(200);

    const usage = await ctx.http().get(api(`/organizations/${f.org.id}/photos/summary`)).set('Authorization', f.auth);
    expect(usage.body.usage?.breakdown?.programmeBytes ?? usage.body.breakdown?.programmeBytes).toBeGreaterThanOrEqual(8000);

    await ctx.http().patch(api(`/events/${f.event.id}/programme/items/${a.body.id}`)).set('Authorization', f.auth).send({ isPublished: false }).expect(200);
    expect((await ctx.http().get(api(posterUrl))).status).toBe(404);

    expect((await ctx.http().put(api(`/events/${f.event.id}/programme/items/${a.body.id}/poster`)).set('Authorization', f.auth).attach('file', Buffer.from('not an image at all, just text'), 'x.png')).status).toBe(400);

    await ctx.http().delete(api(`/events/${f.event.id}/programme/items/${a.body.id}`)).set('Authorization', f.auth).expect(204);
    expect(await ctx.prisma.storedImage.count({ where: { key: { startsWith: `event/${f.event.id}/programme/` } } })).toBe(0);
  });

  it('hides the programme of non-live festivals and blocks other mandals and gate volunteers', async () => {
    const draft = await festival({ approvalStatus: 'DRAFT', status: 'DRAFT' });
    await ctx.http().post(api(`/events/${draft.event.id}/programme/items`)).set('Authorization', draft.auth).send(item(draft.day1)).expect(201);
    expect((await ctx.http().get(api(`/public/events/${draft.event.id}/programme`))).status).toBe(404);

    const f = await festival();
    const other = await festival();
    const created = await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1));
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', other.auth).send(item(f.day1))).status).toBe(404);
    // An item id from festival A can't be edited through festival B's URL.
    expect((await ctx.http().patch(api(`/events/${other.event.id}/programme/items/${created.body.id}`)).set('Authorization', other.auth).send({ title: 'Hijack' })).status).toBe(404);

    const gate = await makeVolunteer(ctx.prisma, f.event.id, 'VOLUNTEER');
    const gateAuth = bearer(ctx, gate);
    expect((await ctx.http().get(api(`/events/${f.event.id}/programme`)).set('Authorization', gateAuth)).status).toBe(200);
    expect((await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', gateAuth).send(item(f.day1))).status).toBe(403);
  });

  it('copies a day as unpublished drafts', async () => {
    const f = await festival();
    await ctx.http().post(api(`/events/${f.event.id}/programme/items`)).set('Authorization', f.auth).send(item(f.day1)).expect(201);
    const c = await ctx.http().post(api(`/events/${f.event.id}/programme/days/${f.day1}/copy-to/${f.day2}`)).set('Authorization', f.auth);
    expect(c.status).toBe(201);
    expect(c.body).toEqual({ copied: 1 });
    const copies = await ctx.prisma.programmeItem.findMany({ where: { eventId: f.event.id, date: new Date(`${f.day2}T00:00:00Z`) }, include: { guests: true } });
    expect(copies).toEqual([expect.objectContaining({ isPublished: false, isHeadline: false, guests: [expect.objectContaining({ name: 'Falguni Pathak' })] })]);
  });
});
