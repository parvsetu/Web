/** Public pass booking: pricing, capacity holds, demo payment, single minting, gate redemption. */
import { DateTime } from 'luxon';
import { bearer, bootApp, idem, makeOrgWithEvent, makeVolunteer, scan, TestCtx, verifyPayouts } from './helpers';

describe('Public pass booking (e2e)', () => {
  let ctx: TestCtx;
  let event: { id: string };
  let adminAuth: string;
  let slotId: string;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;
  // A slot that is open right now in IST, so the pass can be scanned in the test.
  const nowSlot = () => {
    const n = DateTime.now().setZone('Asia/Kolkata');
    return { startTime: '00:00', endTime: '23:59', date: n.toISODate()! };
  };
  const order = (body: Record<string, unknown>) => ctx.http().post(api('/public/booking/orders')).send(body);

  beforeAll(async () => {
    ctx = await bootApp();
    const made = await makeOrgWithEvent(ctx.prisma);
    event = made.event;
    adminAuth = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    await ctx.http().patch(api(`/events/${event.id}`)).set('Authorization', adminAuth).send({ publicBookingEnabled: true });
    const s = nowSlot();
    const slot = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
      .send({ label: 'All day', startTime: s.startTime, endTime: s.endTime, capacity: 5, price: 50 });
    expect(slot.body.price).toBe('50.00');
    slotId = slot.body.id;
  });
  afterAll(() => ctx.app.close());

  it('lists only events with public booking on, with prices and remaining places', async () => {
    const list = await ctx.http().get(api('/public/booking/events'));
    expect(list.body.find((e: { id: string }) => e.id === event.id)).toMatchObject({ fromPrice: '50.00', onlinePayments: true });
    const avail = await ctx.http().get(api(`/public/booking/events/${event.id}/availability?date=${today()}`));
    expect(avail.body.slots[0]).toMatchObject({ id: slotId, price: '50.00', remaining: 5, ended: false });
    const { event: closed } = await makeOrgWithEvent(ctx.prisma);
    expect((await ctx.http().get(api(`/public/booking/events/${closed.id}`))).status).toBe(404);
  });

  it('prices on the server, holds capacity while pending, and a demo payment mints exactly one pass', async () => {
    const res = await order({ eventId: event.id, timeSlotId: slotId, date: today(), visitorCount: 3, buyerName: 'Meena', buyerMobile: '9811111111', amount: 1 });
    expect(res.status).toBe(400); // client-sent amount is rejected outright (whitelist)
    const ok = await order({ eventId: event.id, timeSlotId: slotId, date: today(), visitorCount: 3, buyerName: 'Meena', buyerMobile: '9811111111', perPersonPasses: false });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', amount: '150.00', pass: null, payment: { provider: 'demo', demo: true } });
    const { id, accessKey } = ok.body;

    // 3 of 5 places held → a 3-person order no longer fits.
    const full = await order({ eventId: event.id, timeSlotId: slotId, date: today(), visitorCount: 3, buyerName: 'Ravi', buyerMobile: '9822222222' });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('SLOT_FULL');

    // Wrong key → 404, same as unknown id.
    expect((await ctx.http().get(api(`/public/booking/orders/${id}?k=${'x'.repeat(32)}`))).status).toBe(404);

    // Two simultaneous confirmations → one pass.
    const [a, b] = await Promise.all([
      ctx.http().post(api(`/public/booking/orders/${id}/demo-pay`)).send({ k: accessKey, outcome: 'success' }),
      ctx.http().post(api(`/public/booking/orders/${id}/demo-pay`)).send({ k: accessKey, outcome: 'success' }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.pass.tokenCode).toBe(b.body.pass.tokenCode);
    expect(await ctx.prisma.token.count({ where: { passOrderId: id } })).toBe(1);
    const paid = await ctx.http().get(api(`/public/booking/orders/${id}?k=${accessKey}`));
    expect(paid.body).toMatchObject({ status: 'PAID', pass: { status: 'ACTIVE' } });

    // The pass works at the gate exactly once, admitting 3.
    const gate = await makeVolunteer(ctx.prisma, event.id);
    const s1 = await scan(ctx, bearer(ctx, gate), { eventId: event.id, qrPayload: paid.body.pass.qrPayload, idempotencyKey: idem() });
    expect(s1.body).toMatchObject({ result: 'SUCCESS', visitorCount: 3 });
    const s2 = await scan(ctx, bearer(ctx, gate), { eventId: event.id, qrPayload: paid.body.pass.qrPayload, idempotencyKey: idem() });
    expect(s2.body.result).toBe('ALREADY_USED');

    // Finance: pass sales counted into the balance; audit row written.
    const fin = await ctx.http().get(api(`/events/${event.id}/reports/finance`)).set('Authorization', adminAuth);
    expect(fin.body.passSales).toMatchObject({ total: '150.00', count: 1, visitors: 3 });
    expect(fin.body.balance).toBe('150.00');
    expect(await ctx.prisma.auditLog.count({ where: { entityId: id, action: 'pass.paid' } })).toBe(1);
  });

  it('a failed or expired payment never mints a pass, and frees its places', async () => {
    const o = await order({ eventId: event.id, timeSlotId: slotId, date: today(), visitorCount: 2, buyerName: 'Asha', buyerMobile: '9833333333' });
    const fail = await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'fail' });
    expect(fail.body).toMatchObject({ status: 'FAILED', pass: null });
    const late = await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' });
    expect(late.status).toBe(409);

    const o2 = await order({ eventId: event.id, timeSlotId: slotId, date: today(), visitorCount: 2, buyerName: 'Asha', buyerMobile: '9833333333' });
    await ctx.prisma.passOrder.update({ where: { id: o2.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const exp = await ctx.http().post(api(`/public/booking/orders/${o2.body.id}/demo-pay`)).send({ k: o2.body.accessKey, outcome: 'success' });
    expect(exp.body.code).toBe('ORDER_EXPIRED');
    expect((await ctx.http().get(api(`/public/booking/orders/${o2.body.id}?k=${o2.body.accessKey}`))).body.status).toBe('EXPIRED');

    // 3 sold, failed/expired holds released → exactly 2 places left.
    const avail = await ctx.http().get(api(`/public/booking/events/${event.id}/availability?date=${today()}`));
    expect(avail.body.slots[0].remaining).toBe(2);
  });

  it('free slots issue the pass immediately; per-pass people limit enforced', async () => {
    const s = nowSlot();
    const free = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
      .send({ label: 'Free darshan', startTime: s.startTime, endTime: s.endTime });
    const o = await order({ eventId: event.id, timeSlotId: free.body.id, date: today(), visitorCount: 2, buyerName: 'Gopal', buyerMobile: '9844444444' });
    expect(o.body).toMatchObject({ status: 'PAID', amount: '0.00', payment: { provider: 'free' } });
    expect(o.body.pass.tokenCode).toMatch(/^TST-/);
    const tooMany = await order({ eventId: event.id, timeSlotId: free.body.id, date: today(), visitorCount: 11, buyerName: 'Gopal', buyerMobile: '9844444444' });
    expect(tooMany.status).toBe(400);
  });

  it('desk issuance also respects online holds (shared capacity)', async () => {
    const s = nowSlot();
    const slot = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
      .send({ label: 'Tiny', startTime: s.startTime, endTime: s.endTime, capacity: 2, price: 10 });
    await order({ eventId: event.id, timeSlotId: slot.body.id, date: today(), visitorCount: 2, buyerName: 'Hold', buyerMobile: '9855555555' });
    const desk = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
      .send({ timeSlotId: slot.body.id, date: today() });
    expect(desk.status).toBe(409);
  });

  it('admins see orders; volunteers do not', async () => {
    const list = await ctx.http().get(api(`/events/${event.id}/pass-orders?status=PAID`)).set('Authorization', adminAuth);
    expect(list.body.totals.revenue).toBe('150.00');
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);
    const gate = await makeVolunteer(ctx.prisma, event.id);
    expect((await ctx.http().get(api(`/events/${event.id}/pass-orders`)).set('Authorization', bearer(ctx, gate))).status).toBe(403);
  });

  it('one QR per person: a 3-person order mints 3 single-entry passes; group mode mints 1', async () => {
    const s = nowSlot();
    const slot = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
      .send({ label: 'Per person', startTime: s.startTime, endTime: s.endTime, capacity: 20, price: 20 });
    const o = await order({ eventId: event.id, timeSlotId: slot.body.id, date: today(), visitorCount: 3, buyerName: 'Family', buyerMobile: '9866666666' });
    expect(o.body.perPersonPasses).toBe(true);
    const paid = await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' });
    expect(paid.body.passes).toHaveLength(3);
    expect(paid.body.passes.every((p: { admits: number }) => p.admits === 1)).toBe(true);
    expect(new Set(paid.body.passes.map((p: { qrPayload: string }) => p.qrPayload)).size).toBe(3);
    const gate = bearer(ctx, await makeVolunteer(ctx.prisma, event.id));
    for (const p of paid.body.passes) {
      expect((await scan(ctx, gate, { eventId: event.id, qrPayload: p.qrPayload, idempotencyKey: idem() })).body.result).toBe('SUCCESS');
    }
    expect((await scan(ctx, gate, { eventId: event.id, qrPayload: paid.body.passes[0].qrPayload, idempotencyKey: idem() })).body.result).toBe('ALREADY_USED');

    const g = await order({ eventId: event.id, timeSlotId: slot.body.id, date: today(), visitorCount: 3, buyerName: 'Group', buyerMobile: '9877777777', perPersonPasses: false });
    const gp = await ctx.http().post(api(`/public/booking/orders/${g.body.id}/demo-pay`)).send({ k: g.body.accessKey, outcome: 'success' });
    expect(gp.body.passes).toHaveLength(1);
    expect(gp.body.passes[0].admits).toBe(3);

    // Desk: per-person issuance
    const desk = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
      .send({ timeSlotId: slot.body.id, date: today(), visitorCount: 4, perPerson: true });
    expect(desk.body.count).toBe(4);
    expect(desk.body.tokens.every((t: { visitorCount: number }) => t.visitorCount === 1)).toBe(true);
  });
});
