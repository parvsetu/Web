/** Peak-day pricing: rules CRUD/validation, availability, createOrder charges the effective price, GST slab follows it. */
import { assign, bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx, verifyPayouts } from './helpers';

describe('Peak-day pricing (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => (ctx = await bootApp()));
  afterAll(() => ctx.app.close());

  const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const plus = (days: number) => new Date(Date.now() + 5.5 * 3600_000 + days * 86400000).toISOString().slice(0, 10);

  async function setup(price = 90) {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', auth).send({ publicBookingEnabled: true });
    const slot = (await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', auth).send({ label: 'Day', startTime: '00:00', endTime: '23:59', price })).body;
    const other = (await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', auth).send({ label: 'Late', startTime: '00:00', endTime: '23:59', price })).body;
    const rule = (body: object) => ctx.http().post(api(`/events/${m.event.id}/price-rules`)).set('Authorization', auth).send(body);
    return { ...m, auth, slot, other, rule };
  }

  it('availability and createOrder use the effective price; base is shown struck through', async () => {
    const m = await setup(90);
    const r = await m.rule({ label: 'Ashtami peak', kind: 'DATES', dates: [today()], timeSlotIds: [m.slot.id], upliftPercent: 20 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ label: 'Ashtami peak', kind: 'DATES', dates: [today()], upliftPercent: 20, fixedPrice: null });
    const av = await ctx.http().get(api(`/public/booking/events/${m.event.id}/availability`)).query({ date: today() });
    const day = av.body.slots.find((s: { id: string }) => s.id === m.slot.id);
    const late = av.body.slots.find((s: { id: string }) => s.id === m.other.id);
    expect(day).toMatchObject({ price: '108.00', basePrice: '90.00', ruleLabel: 'Ashtami peak' });
    expect(late).toMatchObject({ price: '90.00', basePrice: '90.00', ruleLabel: null });
    const ev = await ctx.http().get(api(`/public/booking/events/${m.event.id}`));
    expect(ev.body.peakDates).toEqual([{ date: today(), label: 'Ashtami peak' }]);
    expect(ev.body.slots[0].price).toBe('90.00'); // base prices in the catalogue

    const o = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: m.slot.id, date: today(), visitorCount: 2, buyerName: 'Ravi', buyerMobile: '9811111111' });
    expect(o.status).toBe(201);
    expect(o.body).toMatchObject({ unitPrice: '108.00', amount: '216.00', priceRuleLabel: 'Ashtami peak' });
    // The same slot on another day is back to base.
    const o2 = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: m.slot.id, date: plus(2), visitorCount: 1, buyerName: 'Ravi', buyerMobile: '9811111111' });
    expect(o2.body).toMatchObject({ unitPrice: '90.00', amount: '90.00', priceRuleLabel: null });
  });

  it('GST slab follows the effective per-ticket price (₹90 +20% = ₹108 → 18%)', async () => {
    const m = await setup(90);
    await ctx.prisma.payoutAccount.update({ where: { organizationId: m.org.id }, data: { gstin: '27AAATS1234Z1Z5' } });
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ gstEnabled: true, gstMode: 'SLAB', gstRatePercent: 18, gstLowRatePercent: 5, gstSlabThreshold: 100, gstBearer: 'CUSTOMER' });
    const base = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: m.slot.id, date: today(), visitorCount: 1, buyerName: 'Anu', buyerMobile: '9811111111' });
    expect(base.body).toMatchObject({ amount: '94.50' }); // ₹90 → 5%
    await m.rule({ label: 'Peak', kind: 'DATES', dates: [today()], upliftPercent: 20 });
    const o = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: m.slot.id, date: today(), visitorCount: 1, buyerName: 'Anu', buyerMobile: '9811111111' });
    const paid = (await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' })).body;
    expect(paid).toMatchObject({ unitPrice: '108.00', amount: '127.44', gst: { taxable: '108.00', amount: '19.44', ratePercent: 18 } });
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/settlements`)).set('Authorization', m.auth);
    expect(st.body.items[0]).toMatchObject({ gross: '127.44' });
  });

  it('DATES beat WEEKENDS; preview shows the price per slot per day', async () => {
    const m = await setup(100);
    await m.rule({ label: 'Weekend', kind: 'WEEKENDS', upliftPercent: 50 }).then((r) => expect([201, 400]).toContain(r.status));
    await m.rule({ label: 'Fixed day', kind: 'DATES', dates: [today()], fixedPrice: '120' });
    const pv = await ctx.http().get(api(`/events/${m.event.id}/price-rules/preview`)).set('Authorization', m.auth);
    const t = pv.body.days.find((d: { date: string }) => d.date === today());
    expect(t.slots[0]).toMatchObject({ price: '120.00', basePrice: '100.00', ruleLabel: 'Fixed day' });
    for (const d of pv.body.days.filter((x: { date: string; weekend: boolean }) => x.weekend && x.date !== today())) {
      expect(d.slots[0]).toMatchObject({ price: '150.00', ruleLabel: 'Weekend' });
    }
  });

  it('validation: dates outside the event, both/neither price, foreign slots, permissions', async () => {
    const m = await setup();
    expect((await m.rule({ label: 'Too late', kind: 'DATES', dates: [plus(30)], upliftPercent: 10 })).status).toBe(400);
    expect((await m.rule({ label: 'None', kind: 'DATES', dates: [today()] })).status).toBe(400);
    expect((await m.rule({ label: 'Both', kind: 'DATES', dates: [today()], fixedPrice: '100', upliftPercent: 10 })).status).toBe(400);
    expect((await m.rule({ label: 'No dates', kind: 'DATES', upliftPercent: 10 })).status).toBe(400);
    const other = await makeOrgWithEvent(ctx.prisma);
    const foreign = await ctx.prisma.timeSlot.create({ data: { eventId: other.event.id, label: 'X', startTime: '10:00', endTime: '12:00' } });
    expect((await m.rule({ label: 'Foreign', kind: 'DATES', dates: [today()], timeSlotIds: [foreign.id], upliftPercent: 10 })).status).toBe(400);

    const ok = await m.rule({ label: 'Ok', kind: 'DATES', dates: [today()], upliftPercent: 10 });
    const upd = await ctx.http().patch(api(`/events/${m.event.id}/price-rules/${ok.body.id}`)).set('Authorization', m.auth).send({ fixedPrice: '150' });
    expect(upd.body).toMatchObject({ fixedPrice: '150.00', upliftPercent: null });

    const viewer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, m.event.id, viewer.id, 'REPORT_VIEWER');
    const v = bearer(ctx, viewer);
    expect((await ctx.http().get(api(`/events/${m.event.id}/price-rules`)).set('Authorization', v)).status).toBe(200);
    expect((await ctx.http().post(api(`/events/${m.event.id}/price-rules`)).set('Authorization', v).send({ label: 'x', kind: 'DATES', dates: [today()], upliftPercent: 5 })).status).toBe(403);
    expect((await ctx.http().delete(api(`/events/${m.event.id}/price-rules/${ok.body.id}`)).set('Authorization', v)).status).toBe(403);
    expect((await ctx.http().patch(api(`/events/${other.event.id}/price-rules/${ok.body.id}`)).set('Authorization', bearer(ctx, other.admin)).send({ label: 'hijack' })).status).toBe(404);
    expect((await ctx.http().delete(api(`/events/${m.event.id}/price-rules/${ok.body.id}`)).set('Authorization', m.auth)).status).toBe(204);
    expect(await ctx.prisma.auditLog.count({ where: { eventId: m.event.id, action: { startsWith: 'price_rule.' } } })).toBe(3);
  });
});
