/** Instagram import: connect (signed state), sync → review queue, approve copies into storage, landing page section, isolation. */
import { createHmac } from 'crypto';
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

describe('Instagram photo import (e2e, simulated Instagram)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  async function mandal() {
    const m = await makeOrgWithEvent(ctx.prisma);
    return { ...m, auth: bearer(ctx, m.admin) };
  }
  const stateOf = (url: string) => new URL(url).searchParams.get('state')!;
  async function connect(m: { org: { id: string }; auth: string }, code = `demo_${m.org.id.replace(/-/g, '').slice(0, 12)}`) {
    const c = await ctx.http().post(api(`/organizations/${m.org.id}/instagram/connect`)).set('Authorization', m.auth);
    expect(c.status).toBe(200);
    return ctx.http().post(api('/instagram/callback')).set('Authorization', m.auth).send({ code, state: stateOf(c.body.url) });
  }

  it('connect: signed state for this admin only; first sync queues the photos (videos skipped)', async () => {
    const m = await mandal();
    const s0 = await ctx.http().get(api(`/organizations/${m.org.id}/instagram`)).set('Authorization', m.auth);
    expect(s0.body).toMatchObject({ configured: true, simulated: true, connection: null, counts: { pending: 0 } });
    const c = await ctx.http().post(api(`/organizations/${m.org.id}/instagram/connect`)).set('Authorization', m.auth);
    expect(c.body.url).toContain('/instagram/demo-authorize?state=');
    const state = stateOf(c.body.url);

    // A volunteer can't start it; someone else can't finish it; a tampered state is refused.
    const vol = await makeVolunteer(ctx.prisma, m.event.id);
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/instagram/connect`)).set('Authorization', bearer(ctx, vol))).status).toBe(404);
    const other = await mandal();
    expect((await ctx.http().post(api('/instagram/callback')).set('Authorization', other.auth).send({ code: 'demo_abcdef', state })).body.code).toBe('INSTAGRAM_WRONG_USER');
    expect((await ctx.http().post(api('/instagram/callback')).set('Authorization', m.auth).send({ code: 'demo_abcdef', state: `${state.slice(0, -2)}xx` })).body.code).toBe('INSTAGRAM_BAD_STATE');

    const cb = await ctx.http().post(api('/instagram/callback')).set('Authorization', m.auth).send({ code: 'demo_firstmandal', state });
    expect(cb.status).toBe(200);
    expect(cb.body).toMatchObject({ organizationId: m.org.id, added: 5, skippedVideos: 1, pending: 5 });
    // The token is stored encrypted.
    const row = await ctx.prisma.instagramConnection.findUniqueOrThrow({ where: { organizationId: m.org.id } });
    expect(row.accessTokenEnc).not.toContain('demo_token');
    // The same Instagram account can't be connected to a second mandal.
    expect((await connect(other, 'demo_firstmandal')).body.code).toBe('INSTAGRAM_IN_USE');
  });

  it('review: nothing public until approved; approve stores a copy under the quota; hide removes it; sync never re-offers', async () => {
    const m = await mandal();
    expect((await connect(m)).status).toBe(200);
    const list = await ctx.http().get(api(`/organizations/${m.org.id}/instagram/media?status=PENDING`)).set('Authorization', m.auth);
    expect(list.body.total).toBe(5);
    const [a, b, c] = list.body.items as { id: string; publicUrl: string | null; caption: string }[];
    expect(a.publicUrl).toBeNull();
    // Staff preview of a pending photo is fetched from Instagram, not stored.
    const prev = await ctx.http().get(api(`/organizations/${m.org.id}/instagram/media/${a.id}/image`)).set('Authorization', m.auth);
    expect(prev.status).toBe(200);
    expect(prev.headers['content-type']).toBe('image/png');
    expect(await ctx.prisma.storedImage.count({ where: { organizationId: m.org.id } })).toBe(0);
    expect((await ctx.http().get(api(`/public/instagram/${a.id}/image`))).status).toBe(404);
    const before = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page/preview`)).set('Authorization', m.auth);
    expect(before.body.instagram).toBeNull();

    const ap = await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/approve`)).set('Authorization', m.auth).send({ ids: [a.id, b.id] });
    expect(ap.body.results).toEqual([{ id: a.id, ok: true }, { id: b.id, ok: true }]);
    expect(ap.body.status.counts).toMatchObject({ pending: 3, approved: 2 });
    expect(ap.body.status.usage.breakdown.instagramBytes).toBeGreaterThan(0);
    // Approving twice is reported per photo, not as a failure of the whole call.
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/approve`)).set('Authorization', m.auth).send({ ids: [a.id] })).body.results[0]).toMatchObject({ ok: false, code: 'NOT_PENDING' });

    const pub = await ctx.http().get(api(`/public/instagram/${a.id}/image`));
    expect(pub.status).toBe(200);
    expect(pub.headers['cache-control']).toContain('max-age=86400');
    const page = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page/preview`)).set('Authorization', m.auth);
    expect(page.body.instagram).toMatchObject({ username: expect.stringMatching(/^demo\.mandal\./), photos: expect.any(Array) });
    expect(page.body.instagram.photos).toHaveLength(2);
    expect(page.body.layout.map((s: { id: string }) => s.id)).toContain('instagram');

    // Reject a pending one, hide an approved one: both gone for good, the stored copy deleted.
    await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/reject`)).set('Authorization', m.auth).send({ ids: [c.id, a.id] }).expect(200);
    expect((await ctx.http().get(api(`/public/instagram/${a.id}/image`))).status).toBe(404);
    expect(await ctx.prisma.storedImage.count({ where: { organizationId: m.org.id } })).toBe(1);
    const again = await ctx.http().post(api(`/organizations/${m.org.id}/instagram/sync`)).set('Authorization', m.auth);
    expect(again.body).toMatchObject({ added: 0, pending: 2 });
    // …unless the admin restores them.
    await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/restore`)).set('Authorization', m.auth).send({ ids: [c.id] }).expect(200);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/instagram`)).set('Authorization', m.auth)).body.counts).toMatchObject({ pending: 3, approved: 1, rejected: 1 });

    // Another mandal can't see or act on these.
    const other = await mandal();
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/instagram/media`)).set('Authorization', other.auth)).status).toBe(404);
    expect((await ctx.http().post(api(`/organizations/${other.org.id}/instagram/media/approve`)).set('Authorization', other.auth).send({ ids: [c.id] })).body.code).toBe('INSTAGRAM_NOT_CONNECTED');
  });

  it('disconnect keeps approved photos unless asked; an expired token asks to reconnect; Meta callbacks need a valid signature', async () => {
    const m = await mandal();
    expect((await connect(m)).status).toBe(200);
    const items = (await ctx.http().get(api(`/organizations/${m.org.id}/instagram/media`)).set('Authorization', m.auth)).body.items;
    await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/approve`)).set('Authorization', m.auth).send({ ids: [items[0].id] }).expect(200);

    await ctx.prisma.instagramConnection.update({ where: { organizationId: m.org.id }, data: { tokenExpiresAt: new Date(Date.now() - 1000) } });
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/instagram/sync`)).set('Authorization', m.auth)).body.code).toBe('INSTAGRAM_EXPIRED');
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/instagram`)).set('Authorization', m.auth)).body.connection.status).toBe('EXPIRED');

    const d = await ctx.http().post(api(`/organizations/${m.org.id}/instagram/disconnect`)).set('Authorization', m.auth).send({});
    expect(d.body).toMatchObject({ connection: null, counts: { pending: 0, approved: 1 } });
    expect((await ctx.prisma.instagramConnection.findUniqueOrThrow({ where: { organizationId: m.org.id } })).accessTokenEnc).toBeNull();
    const page = await ctx.http().get(api(`/organizations/${m.org.id}/landing-page/preview`)).set('Authorization', m.auth);
    expect(page.body.instagram).toMatchObject({ username: null });
    expect(page.body.instagram.photos).toHaveLength(1);

    expect((await ctx.http().post(api('/public/instagram/data-deletion')).send({ signed_request: 'abc.def' })).status).toBe(400);
  });

  it('Meta data-deletion request (validly signed, form-encoded) removes everything from that Instagram account', async () => {
    const m = await mandal();
    expect((await connect(m)).status).toBe(200);
    const items = (await ctx.http().get(api(`/organizations/${m.org.id}/instagram/media`)).set('Authorization', m.auth)).body.items;
    await ctx.http().post(api(`/organizations/${m.org.id}/instagram/media/approve`)).set('Authorization', m.auth).send({ ids: [items[0].id] }).expect(200);
    const igUserId = (await ctx.prisma.instagramConnection.findUniqueOrThrow({ where: { organizationId: m.org.id } })).igUserId;
    process.env.INSTAGRAM_APP_SECRET = 'test-meta-secret';
    try {
      const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: igUserId })).toString('base64url');
      const sig = createHmac('sha256', 'test-meta-secret').update(payload).digest('base64url');
      const res = await ctx.http().post(api('/public/instagram/data-deletion')).type('form').send({ signed_request: `${sig}.${payload}` });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ url: expect.any(String), confirmation_code: expect.any(String) });
    } finally {
      delete process.env.INSTAGRAM_APP_SECRET;
    }
    expect(await ctx.prisma.instagramConnection.count({ where: { organizationId: m.org.id } })).toBe(0);
    expect(await ctx.prisma.instagramMedia.count({ where: { organizationId: m.org.id } })).toBe(0);
    expect(await ctx.prisma.storedImage.count({ where: { organizationId: m.org.id } })).toBe(0);
  });
});
