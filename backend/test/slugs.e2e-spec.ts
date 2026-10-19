/** Festival page addresses (/f/<slug>): rules, availability, aliases, public resolution, sitemap. */
import { normaliseSlug, slugCandidates, slugProblem } from '../src/common/event-slug';
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

describe('Festival page addresses (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  async function festival(opts: Parameters<typeof makeOrgWithEvent>[1] = {}) {
    const m = await makeOrgWithEvent(ctx.prisma, opts);
    return { ...m, auth: bearer(ctx, m.admin), year: m.event.startDate.getUTCFullYear() };
  }
  const unique = () => Math.random().toString(36).slice(2, 8).replace(/\d/g, 'x');

  it('normalises, requires the year and suggests mandal + name + year', () => {
    expect(normaliseSlug('  Durga Pujā & Mela — Salt Lake!! ')).toBe('durga-puja-and-mela-salt-lake');
    expect(slugProblem('durga-puja', 2026)).toMatch(/2026/);
    expect(slugProblem('durga-puja-2025', 2026)).toMatch(/2026/);
    expect(slugProblem('durga-puja-2026', 2026)).toBeNull();
    expect(slugProblem('Durga Puja 2026', 2026)).toMatch(/small letters/);
    expect(slugProblem('2026', 2026)).not.toBeNull();
    expect(slugProblem('admin-2026', 2026)).toMatch(/reserved/);
    expect(slugCandidates('Durga Puja 2026', 'Shree Durga Mandal', 2026).slice(0, 2)).toEqual(['shree-durga-mandal-durga-puja-2026', 'durga-puja-2026']);
  });

  it('gives a new festival an address with the mandal name and year', async () => {
    const f = await festival();
    const r = await ctx.http().post(api(`/organizations/${f.org.id}/events`)).set('Authorization', f.auth)
      .send({ name: 'Navratri Utsav', festivalType: 'NAVRATRI', startDate: '2027-10-01', endDate: '2027-10-09' });
    expect(r.status).toBe(201);
    expect(r.body.slug).toBe(`${normaliseSlug(f.org.name)}-navratri-utsav-2027`);
  });

  it('checks live, saves, keeps the old address as an alias and resolves all of them publicly', async () => {
    const f = await festival();
    const want = `utsav-${unique()}-${f.year}`;
    const noYear = await ctx.http().get(api(`/events/${f.event.id}/slug/check`)).query({ slug: 'My Utsav' }).set('Authorization', f.auth);
    expect(noYear.body).toMatchObject({ slug: 'my-utsav', valid: false, available: false });
    expect(noYear.body.suggestion).toBe(`my-utsav-${f.year}`);

    const ok = await ctx.http().get(api(`/events/${f.event.id}/slug/check`)).query({ slug: want }).set('Authorization', f.auth);
    expect(ok.body).toMatchObject({ slug: want, valid: true, available: true, reason: null });
    await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', f.auth).send({ slug: want }).expect(200);

    const second = `${want.replace(`-${f.year}`, '')}-pandal-${f.year}`;
    await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', f.auth).send({ slug: second }).expect(200);
    for (const key of [second, want, f.event.id]) {
      const pub = await ctx.http().get(api(`/public/events/${key}`));
      expect(pub.status).toBe(200);
      expect(pub.body).toMatchObject({ id: f.event.id, slug: second });
    }

    // Another festival can't take either the current or the old address.
    const other = await festival();
    for (const taken of [second, want]) {
      const c = await ctx.http().get(api(`/events/${other.event.id}/slug/check`)).query({ slug: taken.replace(String(f.year), String(other.year)) }).set('Authorization', other.auth);
      if (other.year === f.year) expect(c.body).toMatchObject({ valid: true, available: false });
      const put = await ctx.http().put(api(`/events/${other.event.id}/slug`)).set('Authorization', other.auth).send({ slug: taken });
      expect(put.status).toBe(other.year === f.year ? 409 : 400);
    }

    // The festival can take its own old address back.
    await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', f.auth).send({ slug: want }).expect(200);
    expect(await ctx.prisma.eventSlugAlias.findUnique({ where: { slug: want } })).toBeNull();
    expect(await ctx.prisma.eventSlugAlias.findUnique({ where: { slug: second } })).toMatchObject({ eventId: f.event.id });
  });

  it('rejects an address without the year, and only editors may change it', async () => {
    const f = await festival();
    const bad = await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', f.auth).send({ slug: 'no-year-here' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('SLUG_INVALID');
    const gate = bearer(ctx, await makeVolunteer(ctx.prisma, f.event.id, 'VOLUNTEER'));
    expect((await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', gate).send({ slug: `gate-${unique()}-${f.year}` })).status).toBe(403);
    expect((await ctx.http().get(api(`/events/${f.event.id}/slug/check`)).query({ slug: 'x' }).set('Authorization', gate)).status).toBe(403);
    const stranger = await festival();
    expect((await ctx.http().put(api(`/events/${f.event.id}/slug`)).set('Authorization', stranger.auth).send({ slug: `x-${unique()}-${f.year}` })).status).toBe(404);
  });

  it('lists public festivals by address in the sitemap and leaves drafts out', async () => {
    const live = await festival();
    const slug = `sitemap-${unique()}-${live.year}`;
    await ctx.http().put(api(`/events/${live.event.id}/slug`)).set('Authorization', live.auth).send({ slug }).expect(200);
    const draft = await festival({ approvalStatus: 'DRAFT', status: 'DRAFT' });
    const s = await ctx.http().get(api('/public/sitemap'));
    expect(s.status).toBe(200);
    const paths = s.body.festivals.map((f: { path: string }) => f.path);
    expect(paths).toContain(slug);
    expect(paths).not.toContain(draft.event.id);
    expect((await ctx.http().get(api(`/public/events/${draft.event.id}`))).status).toBe(404);
    expect((await ctx.http().get(api('/public/events/no-such-festival-2026'))).status).toBe(404);
  });
});
