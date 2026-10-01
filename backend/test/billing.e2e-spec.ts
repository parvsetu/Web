/** Prepaid token credit: commission per pass, hard limit, low/exhausted states, recharge, admin. */
import { bearer, bootApp, makeOrgWithEvent, makeUser, makeVolunteer, TestCtx, verifyPayouts } from './helpers';

describe('Prepaid token credit (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  /** A mandal with ₹100 token price, 1% commission (₹1/pass) and the given credit. */
  async function mandal(creditRupees: number) {
    const m = await makeOrgWithEvent(ctx.prisma);
    await ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { creditBalancePaise: creditRupees * 100, tokenPricePaise: 10000, commissionBps: 100, lowCreditThresholdPaise: 200 } });
    return { ...m, auth: bearer(ctx, m.admin) };
  }
  const issue = (m: { event: { id: string }; auth: string }, body: object = {}) =>
    ctx.http().post(api(`/events/${m.event.id}/tokens`)).set('Authorization', m.auth).send({ durationHours: 3, ...body });

  it('deducts commission (price × %) per person and blocks the pass that would exceed credit', async () => {
    const m = await mandal(3);
    expect((await issue(m)).status).toBe(201);
    expect((await issue(m, { visitorCount: 2, perPerson: true })).status).toBe(201); // 2 people = ₹2
    const before = await ctx.prisma.token.count({ where: { eventId: m.event.id } });
    const blocked = await issue(m);
    expect(blocked.status).toBe(402);
    expect(blocked.body).toMatchObject({ code: 'CREDIT_EXHAUSTED', message: expect.stringContaining('exhausted') });
    expect(await ctx.prisma.token.count({ where: { eventId: m.event.id } })).toBe(before); // nothing created
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', m.auth);
    expect(st.body).toMatchObject({ state: 'EXHAUSTED', balance: '0.00', feePerPass: '1.00', tokenPrice: '100.00', commissionPercent: '1.00', tokensLeft: 0, totals: { tokens: 3, persons: 3, fees: '3.00' } });
  });

  it('20 simultaneous passes with credit for 5 → exactly 5 succeed, balance never negative', async () => {
    const m = await mandal(5);
    const res = await Promise.all(Array.from({ length: 20 }, () => issue(m)));
    expect(res.filter((r) => r.status === 201)).toHaveLength(5);
    expect(res.filter((r) => r.status === 402)).toHaveLength(15);
    const b = await ctx.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId: m.org.id } });
    expect(b.creditBalancePaise).toBe(0);
    expect(await ctx.prisma.token.count({ where: { eventId: m.event.id } })).toBe(5);
    // Database backstop: a direct overdraw is refused.
    await expect(ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { creditBalancePaise: -1 } })).rejects.toThrow();
  });

  it('bulk generation and donation passes are covered too (no bypass)', async () => {
    const m = await mandal(10);
    const bulk = await ctx.http().post(api(`/events/${m.event.id}/tokens/bulk`)).set('Authorization', m.auth).send({ count: 11, durationHours: 3 });
    expect(bulk.status).toBe(402);
    expect(await ctx.prisma.token.count({ where: { eventId: m.event.id } })).toBe(0);
    expect((await ctx.http().post(api(`/events/${m.event.id}/tokens/bulk`)).set('Authorization', m.auth).send({ count: 8, durationHours: 3 })).status).toBe(201);
    const don = await ctx.http().post(api(`/events/${m.event.id}/donations`)).set('Authorization', m.auth)
      .send({ donorName: 'X', amount: '500', method: 'CASH', passes: { durationHours: 3, visitorCount: 3, perPerson: true } });
    expect(don.status).toBe(402); // needs ₹3, only ₹2 left — and the donation isn't recorded either
    expect(await ctx.prisma.donation.count({ where: { eventId: m.event.id } })).toBe(0);
  });

  it('paid online orders take commission by split (not credit); free online passes use credit', async () => {
    const m = await mandal(5);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ publicBookingEnabled: true });
    const paidSlot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', m.auth).send({ label: 'Paid', startTime: '00:00', endTime: '23:59', price: 50 });
    const freeSlot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', m.auth).send({ label: 'Free', startTime: '00:00', endTime: '23:59' });
    const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const o = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: paidSlot.body.id, date, visitorCount: 4, buyerName: 'Asha', buyerMobile: '9811111111' });
    expect(o.status).toBe(201);
    await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' });
    const bal = async () => (await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', m.auth)).body.balance;
    expect(await bal()).toBe('5.00'); // ₹200 paid online → commission ₹4 taken by the split, credit untouched
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/settlements`)).set('Authorization', m.auth);
    expect(st.body.items[0]).toMatchObject({ gross: '200.00', commission: '4.00', net: '196.00', status: 'PENDING_PAYOUT' });
    const f = await ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: freeSlot.body.id, date, visitorCount: 2, buyerName: 'Free', buyerMobile: '9822222222' });
    expect(f.body.status).toBe('PAID');
    expect(await bal()).toBe('3.00'); // free online passes are internal → ₹1 × 2 from credit
  });

  it('low-credit warning, demo recharge, history, and access rules', async () => {
    const m = await mandal(150);
    await ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { lowCreditThresholdPaise: 20000 } });
    const low = await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', m.auth);
    expect(low.body).toMatchObject({ state: 'LOW', tokensLeft: 150, message: expect.stringContaining('running low') });
    const r = await ctx.http().post(api(`/organizations/${m.org.id}/billing/recharges`)).set('Authorization', m.auth).send({ amount: '1000' });
    expect(r.body.status).toBe('PENDING');
    const paid = await ctx.http().post(api(`/organizations/${m.org.id}/billing/recharges/${r.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' });
    expect(paid.body.status).toBe('PAID');
    await ctx.http().post(api(`/organizations/${m.org.id}/billing/recharges/${r.body.id}/demo-pay`)).set('Authorization', m.auth).send({ outcome: 'success' }); // replay
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', m.auth);
    expect(st.body).toMatchObject({ state: 'OK', balance: '1150.00', tokensLeft: 1150 });
    const hist = await ctx.http().get(api(`/organizations/${m.org.id}/billing/transactions?type=RECHARGE`)).set('Authorization', m.auth);
    expect(hist.body.items).toHaveLength(1);

    const v = bearer(ctx, await makeVolunteer(ctx.prisma, m.event.id, 'TOKEN_ISSUER'));
    expect((await ctx.http().post(api(`/organizations/${m.org.id}/billing/recharges`)).set('Authorization', v).send({ amount: '1' })).status).toBe(404);
    expect((await ctx.http().get(api(`/events/${m.event.id}/credit-status`)).set('Authorization', v)).body.state).toBe('OK');
    expect((await ctx.http().get(api('/platform/billing/summary')).set('Authorization', m.auth)).status).toBe(403);
  });

  it('super admin sets commission/pricing, adjusts credit, sees earnings and low mandals', async () => {
    const m = await mandal(0);
    const set = await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ defaultCommissionPercent: '2', defaultTokenPrice: '50', lowCreditThreshold: '200' });
    expect(set.body).toMatchObject({ defaultCommissionPercent: '2.00', feePerPass: '1.00' });
    await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', sa).send({ tokenPrice: null, commissionPercent: '3', lowCreditThreshold: null });
    const adj = await ctx.http().post(api(`/platform/billing/mandals/${m.org.id}/adjust`)).set('Authorization', sa).send({ amount: '15', reason: 'Offline UPI payment' });
    expect(adj.body).toMatchObject({ commissionPercent: '3.00', tokenPrice: '50.00', feePerPass: '1.50', balance: '15.00', tokensLeft: 10 });
    expect((await ctx.http().post(api(`/platform/billing/mandals/${m.org.id}/adjust`)).set('Authorization', sa).send({ amount: '-20', reason: 'Oops' })).status).toBe(400);
    const list = await ctx.http().get(api('/platform/billing/mandals?state=LOW&pageSize=200')).set('Authorization', sa);
    expect(list.body.items.some((x: { id: string }) => x.id === m.org.id)).toBe(true);
    const sum = await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa);
    expect(Number(sum.body.commissionEarned)).toBeGreaterThan(0);
    await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ defaultCommissionPercent: '1', defaultTokenPrice: '100' });
  });

  it('partner promotion: printing partners on passes costs the print fee per pass per partner', async () => {
    const m = await mandal(10);
    await ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { sponsorPassFeePaise: 50 } }); // ₹0.50
    const a = await ctx.http().post(api(`/organizations/${m.org.id}/sponsors`)).set('Authorization', m.auth).send({ name: 'Tanishq', tier: 'GOLD', showOnPasses: true });
    await ctx.http().post(api(`/organizations/${m.org.id}/sponsors`)).set('Authorization', m.auth).send({ name: 'Sweets', showOnPasses: true });
    await ctx.http().post(api(`/organizations/${m.org.id}/sponsors`)).set('Authorization', m.auth).send({ name: 'Not printed' });

    // 2 per-person passes: commission 2 × ₹1 + print 2 passes × 2 partners × ₹0.50 = ₹4
    const t = await issue(m, { visitorCount: 2, perPerson: true });
    expect(t.status).toBe(201);
    expect(t.body.tokens[0].sponsorIds).toHaveLength(2);
    const st = await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', m.auth);
    expect(st.body).toMatchObject({ balance: '6.00', partnerPrintFeePerPass: '0.50', totals: { fees: '2.00', partnerFees: '2.00' } });
    const list = await ctx.http().get(api(`/organizations/${m.org.id}/sponsors`)).set('Authorization', m.auth);
    expect(list.body.find((x: { id: string }) => x.id === a.body.id)).toMatchObject({ passesPrinted: 2, printFees: '1.00' });

    // A batch whose print fee would overdraw is refused as a whole.
    expect((await ctx.http().post(api(`/events/${m.event.id}/tokens/bulk`)).set('Authorization', m.auth).send({ count: 4, durationHours: 3 })).status).toBe(402);
    const sum = await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa);
    expect(Number(sum.body.partnerFeesEarned)).toBeGreaterThanOrEqual(2);
  });
});
