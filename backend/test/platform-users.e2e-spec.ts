/** Super-admin user list shows each user's mandal roles and festival assignments, with filters. */
import { assign, bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Platform users list (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  it('lists memberships and assignments and filters by mandal and type; mandal admins are denied', async () => {
    const sa = await makeUser(ctx.prisma, { isSuperAdmin: true });
    const m = await makeOrgWithEvent(ctx.prisma);
    const vol = await makeUser(ctx.prisma, { name: `Vol ${m.org.id.slice(0, 6)}` });
    await assign(ctx.prisma, m.event.id, vol.id, 'VOLUNTEER');
    const auth = bearer(ctx, sa);
    const r = await ctx.http().get(api('/users')).query({ organizationId: m.org.id }).set('Authorization', auth);
    expect(r.status).toBe(200);
    const byId = new Map(r.body.items.map((u: { id: string }) => [u.id, u]));
    expect(r.body.total).toBe(2);
    expect(byId.get(m.admin.id)).toMatchObject({ memberships: [{ status: 'ACTIVE', role: { key: 'MANDAL_ADMIN' }, organization: { id: m.org.id } }] });
    expect(byId.get(vol.id)).toMatchObject({ memberships: [], assignments: [{ role: { key: 'VOLUNTEER' }, event: { id: m.event.id, organization: { id: m.org.id } } }] });
    const vols = await ctx.http().get(api('/users')).query({ organizationId: m.org.id, kind: 'VOLUNTEER' }).set('Authorization', auth);
    expect(vols.body.items.map((u: { id: string }) => u.id)).toEqual([vol.id]);
    expect((await ctx.http().get(api('/users')).set('Authorization', bearer(ctx, m.admin))).status).toBe(403);
  });
});
