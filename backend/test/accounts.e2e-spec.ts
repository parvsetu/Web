/** Mandal Accounts (all expenses + yearly P&L) and State/City data. */
import { DateTime } from 'luxon';
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

describe('Accounts & locations (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  it('states and cities are served and validated; festivals inherit the mandal place', async () => {
    const loc = await ctx.http().get(api('/public/locations'));
    expect(loc.body).toHaveLength(36);
    expect(loc.body.find((s: { name: string }) => s.name === 'Maharashtra').cities).toContain('Pune');
    const types = await ctx.http().get(api('/public/festival-types'));
    expect(types.body.length).toBeGreaterThan(50);
    expect(types.body.map((t: { key: string }) => t.key)).toEqual(expect.arrayContaining(['HOLI', 'ONAM', 'EID_UL_FITR', 'CHRISTMAS', 'BAISAKHI', 'PONGAL']));

    const { org, admin } = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, admin);
    expect((await ctx.http().patch(api(`/organizations/${org.id}`)).set('Authorization', auth).send({ state: 'Atlantis' })).status).toBe(400);
    const upd = await ctx.http().patch(api(`/organizations/${org.id}`)).set('Authorization', auth).send({ state: 'mh', city: 'Pune' });
    expect(upd.body).toMatchObject({ state: 'Maharashtra', city: 'Pune' });
    const ev = await ctx.http().post(api(`/organizations/${org.id}/events`)).set('Authorization', auth)
      .send({ name: 'Ganesh Utsav', festivalType: 'GANESH_UTSAV', startDate: '2026-09-01', endDate: '2026-09-10' });
    expect(ev.body).toMatchObject({ state: 'Maharashtra', city: 'Pune' });
  });

  it('records mandal-wide and festival expenses and computes the yearly profit/loss', async () => {
    const { org, event, admin } = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, admin);
    const year = DateTime.now().setZone('Asia/Kolkata').year;
    const today = DateTime.now().setZone('Asia/Kolkata').toISODate();

    await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send({ donorName: 'A', amount: '10000', method: 'CASH' });
    const general = await ctx.http().post(api(`/organizations/${org.id}/expenses`)).set('Authorization', auth)
      .send({ category: 'Rent', description: 'Godown rent', amount: '4000', expenseDate: `${year}-01-10` });
    expect(general.status).toBe(201);
    expect(general.body.eventId).toBeNull();
    await ctx.http().post(api(`/organizations/${org.id}/expenses`)).set('Authorization', auth)
      .send({ category: 'Lighting', description: 'Pandal lights', amount: '9000', expenseDate: today, eventId: event.id });
    const { event: foreign } = await makeOrgWithEvent(ctx.prisma);
    expect((await ctx.http().post(api(`/organizations/${org.id}/expenses`)).set('Authorization', auth)
      .send({ category: 'X', description: 'x', amount: '1', expenseDate: today, eventId: foreign.id })).status).toBe(400);

    const list = await ctx.http().get(api(`/organizations/${org.id}/expenses`)).set('Authorization', auth);
    expect(list.body.totalAmount).toBe('13000.00');
    expect((await ctx.http().get(api(`/organizations/${org.id}/expenses?eventId=none`)).set('Authorization', auth)).body.totalAmount).toBe('4000.00');

    const pl = await ctx.http().get(api(`/organizations/${org.id}/reports/annual?year=${year}`)).set('Authorization', auth);
    expect(pl.body).toMatchObject({ income: { total: '10000.00', donations: '10000.00' }, expenses: { total: '13000.00' }, net: '-3000.00', result: 'LOSS' });
    expect(pl.body.byMonth).toHaveLength(12);
    expect(pl.body.byEvent.find((e: { eventId: string | null }) => e.eventId === null)).toMatchObject({ name: 'General (mandal-wide)', expenses: '4000.00' });
    const fy = await ctx.http().get(api(`/organizations/${org.id}/reports/annual?year=${year}&basis=financial`)).set('Authorization', auth);
    expect(fy.body.label).toBe(`FY ${year}-${String((year + 1) % 100).padStart(2, '0')}`);
    const csv = await ctx.http().get(api(`/organizations/${org.id}/reports/annual?year=${year}&format=csv`)).set('Authorization', auth);
    expect(csv.text).toContain('Total');

    // Volunteers have no access to the mandal's books.
    const gate = await makeVolunteer(ctx.prisma, event.id);
    expect((await ctx.http().get(api(`/organizations/${org.id}/reports/annual?year=${year}`)).set('Authorization', bearer(ctx, gate))).status).toBe(404);
  });

  it('list endpoints page and search on the server', async () => {
    const { org, event, admin } = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, admin);
    for (let i = 0; i < 7; i++) await makeVolunteer(ctx.prisma, event.id, 'VOLUNTEER', `Gate Person ${i}`);
    await makeVolunteer(ctx.prisma, event.id, 'VOLUNTEER', 'Unique Zebra');
    const p1 = await ctx.http().get(api(`/organizations/${org.id}/volunteers?pageSize=5`)).set('Authorization', auth);
    expect(p1.body).toMatchObject({ total: 8, page: 1, pageSize: 5 });
    expect(p1.body.items).toHaveLength(5);
    const p2 = await ctx.http().get(api(`/organizations/${org.id}/volunteers?pageSize=5&page=2`)).set('Authorization', auth);
    expect(p2.body.items).toHaveLength(3);
    const zebra = await ctx.http().get(api(`/organizations/${org.id}/volunteers?q=zebra`)).set('Authorization', auth);
    expect(zebra.body.items.map((v: { name: string }) => v.name)).toEqual(['Unique Zebra']);
    const asg = await ctx.http().get(api(`/events/${event.id}/assignments?q=gate&pageSize=3`)).set('Authorization', auth);
    expect(asg.body).toMatchObject({ total: 7 });
    expect(asg.body.items).toHaveLength(3);
    const members = await ctx.http().get(api(`/organizations/${org.id}/members?q=admin`)).set('Authorization', auth);
    expect(members.body.total).toBe(1);
    const evs = await ctx.http().get(api(`/organizations/${org.id}/events?q=festival`)).set('Authorization', auth);
    expect(evs.body.total).toBe(1);
    expect((await ctx.http().get(api(`/organizations/${org.id}/volunteers?pageSize=500`)).set('Authorization', auth)).status).toBe(400);
  });
});
