/** Pass refunds, programme tickets at the desk, peak pricing for tickets, and the set-up checklist. */
import { DateTime } from 'luxon';
import { bearer, bootApp, idem, makeOrgWithEvent, makeVolunteer, scan, TestCtx, verifyPayouts } from './helpers';

describe('Pass refunds, desk tickets, set-up checklist (e2e)', () => {
  let ctx: TestCtx;
  let eventId: string;
  let orgId: string;
  let auth: string;
  let slotId: string;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;
  let n = 0;
  const buyer = () => ({ buyerName: `Buyer ${++n}`, buyerMobile: `98${String(10_000_000 + n).padStart(8, '0')}` });

  /** Books and demo-pays an order; returns the paid order body (with accessKey). */
  async function paidOrder(body: Record<string, unknown>) {
    const o = await ctx.http().post(api('/public/booking/orders')).send({ eventId, date: today(), ...buyer(), ...body });
    expect(o.status).toBe(201);
    const p = await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' });
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('PAID');
    return { ...p.body, accessKey: o.body.accessKey as string };
  }
  const cancel = (orderId: string, body: Record<string, unknown>, a = auth) =>
    ctx.http().post(api(`/events/${eventId}/pass-orders/${orderId}/cancel`)).set('Authorization', a).send(body);
  const ticketItem = async (title: string, price: number, capacity: number) => {
    const r = await ctx.http().post(api(`/events/${eventId}/programme/items`)).set('Authorization', auth)
      .send({ date: today(), startTime: '00:00', endTime: '23:59', title, ticketed: true, ticketPrice: price, ticketCapacity: capacity });
    expect(r.status).toBe(201);
    return r.body.id as string;
  };

  beforeAll(async () => {
    ctx = await bootApp();
    const m = await makeOrgWithEvent(ctx.prisma);
    eventId = m.event.id;
    orgId = m.org.id;
    auth = bearer(ctx, m.admin);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${eventId}`)).set('Authorization', auth).send({ publicBookingEnabled: true }).expect(200);
    const s = await ctx.http().post(api(`/events/${eventId}/time-slots`)).set('Authorization', auth)
      .send({ label: 'Day entry', startTime: '00:00', endTime: '23:59', price: 50 });
    expect(s.status).toBe(201);
    slotId = s.body.id;
  });
  afterAll(() => ctx.app.close());

  describe('refunds', () => {
    it('cancels a paid booking: passes stop, full refund, negative settlement, buyer sees it', async () => {
      const o = await paidOrder({ timeSlotId: slotId, visitorCount: 2, perPersonPasses: true });
      expect((await cancel(o.id, { reason: 'no' })).status).toBe(400);

      const r = await cancel(o.id, { reason: 'Gate closed early due to rain' });
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ status: 'CANCELLED', refund: { amount: o.amount, reason: 'Gate closed early due to rain' } });
      // The demo gateway refunds at once, so the reference is filled in.
      expect(r.body.refund.state).toBe('SENT');
      expect(r.body.refund.reference).toMatch(/^demo_refund_/);

      const tokens = await ctx.prisma.token.findMany({ where: { passOrderId: o.id } });
      expect(tokens.map((t) => t.status)).toEqual(['CANCELLED', 'CANCELLED']);
      const refundRow = await ctx.prisma.paymentSettlement.findUniqueOrThrow({ where: { sourceId: `refund:${o.id}` } });
      expect(refundRow.sourceType).toBe('PASS_REFUND');
      expect(refundRow.grossPaise).toBe(-Math.round(Number(o.amount) * 100));

      const view = await ctx.http().get(api(`/public/booking/orders/${o.id}?k=${o.accessKey}`));
      expect(view.body).toMatchObject({ status: 'CANCELLED', refund: { state: 'SENT', amount: o.amount } });

      // Only once.
      const again = await cancel(o.id, { reason: 'Second try at cancelling' });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('ORDER_NOT_PAID');
    });

    it('refunds only the unused share by default, and refuses more than was paid', async () => {
      const o = await paidOrder({ timeSlotId: slotId, visitorCount: 2, perPersonPasses: true });
      const tooMuch = await cancel(o.id, { reason: 'Customer asked to cancel', refund: String(Number(o.amount) + 1) });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.code).toBe('REFUND_TOO_HIGH');

      const gate = await makeVolunteer(ctx.prisma, eventId);
      const s = await scan(ctx, bearer(ctx, gate), { eventId, qrPayload: o.passes[0].qrPayload, idempotencyKey: idem() });
      expect(s.body.result).toBe('SUCCESS');

      const r = await cancel(o.id, { reason: 'One of them could not come' });
      expect(r.status).toBe(200);
      expect(Number(r.body.refund.amount)).toBeCloseTo(Number(o.amount) / 2, 2);
      const tokens = await ctx.prisma.token.findMany({ where: { passOrderId: o.id }, orderBy: { tokenCode: 'asc' } });
      expect(tokens.map((t) => t.status).sort()).toEqual(['CANCELLED', 'USED']);
    });

    it('records a refund sent outside Parvsetu, once', async () => {
      const o = await paidOrder({ timeSlotId: slotId, visitorCount: 1 });
      await cancel(o.id, { reason: 'Booked the wrong day' }).expect(200);
      // As if the gateway couldn't refund: the refund waits for the organiser.
      await ctx.prisma.passOrder.update({ where: { id: o.id }, data: { refundReference: null, refundedAt: null } });

      const toSend = await ctx.http().get(api(`/events/${eventId}/pass-orders?refundToSend=true`)).set('Authorization', auth);
      expect(toSend.body.items.map((x: { id: string }) => x.id)).toEqual([o.id]);
      expect(toSend.body.items[0].refund.state).toBe('TO_SEND');
      expect(toSend.body.totals.refundsToSend).toEqual({ count: 1, amount: o.amount });

      const sent = await ctx.http().post(api(`/events/${eventId}/pass-orders/${o.id}/refund-sent`)).set('Authorization', auth).send({ refundReference: 'UTR123456' });
      expect(sent.status).toBe(200);
      expect(sent.body.refund).toMatchObject({ state: 'SENT', reference: 'UTR123456' });
      const twice = await ctx.http().post(api(`/events/${eventId}/pass-orders/${o.id}/refund-sent`)).set('Authorization', auth).send({ refundReference: 'UTR999' });
      expect(twice.status).toBe(409);
      expect(twice.body.code).toBe('NO_REFUND_DUE');

      const all = await ctx.http().get(api(`/events/${eventId}/pass-orders?status=CANCELLED`)).set('Authorization', auth);
      expect(all.body.items.every((x: { status: string }) => x.status === 'CANCELLED')).toBe(true);
      expect(all.body.totals).toMatchObject({ cancelledOrders: 3, refundsToSend: { count: 0 } });
    });

    it('needs money-handling permission to cancel', async () => {
      const o = await paidOrder({ timeSlotId: slotId, visitorCount: 1 });
      const vol = await makeVolunteer(ctx.prisma, eventId);
      expect((await cancel(o.id, { reason: 'Volunteer trying to cancel' }, bearer(ctx, vol))).status).toBe(403);
    });

    it('cancelling a ticketed programme refunds its bookings in full and cancels desk tickets', async () => {
      const itemId = await ticketItem('Garba night', 100, 10);
      const o = await paidOrder({ programmeItemId: itemId, visitorCount: 2, perPersonPasses: false });
      const desk = await ctx.http().post(api(`/events/${eventId}/tokens`)).set('Authorization', auth).send({ programmeItemId: itemId, visitorCount: 1 });
      expect(desk.status).toBe(201);

      await ctx.http().patch(api(`/events/${eventId}/programme/items/${itemId}`)).set('Authorization', auth)
        .send({ status: 'CANCELLED', statusNote: 'Artist unwell' }).expect(200);

      const row = await ctx.prisma.passOrder.findUniqueOrThrow({ where: { id: o.id } });
      expect(row.status).toBe('CANCELLED');
      expect(row.refundPaise).toBe(Math.round(Number(o.amount) * 100));
      const deskToken = await ctx.prisma.token.findFirstOrThrow({ where: { programmeItemId: itemId, passOrderId: null } });
      expect(deskToken.status).toBe('CANCELLED');
    });
  });

  describe('desk tickets', () => {
    let itemId: string;

    it('lists ticketed programmes for a date with price and places left', async () => {
      itemId = await ticketItem('Dandiya night', 100, 3);
      const r = await ctx.http().get(api(`/events/${eventId}/desk-tickets?date=${today()}`)).set('Authorization', auth);
      expect(r.status).toBe(200);
      expect(r.body.find((x: { id: string }) => x.id === itemId)).toMatchObject({ title: 'Dandiya night', price: '100.00', remaining: 3, ended: false, cancelled: false });
      expect((await ctx.http().get(api(`/events/${eventId}/desk-tickets?date=2000-01-01`)).set('Authorization', auth)).status).toBe(400);
    });

    it('issues a ticket at the desk sharing capacity with online sales', async () => {
      const t = await ctx.http().post(api(`/events/${eventId}/tokens`)).set('Authorization', auth).send({ programmeItemId: itemId, visitorCount: 2, perPerson: false });
      expect(t.status).toBe(201);
      const row = await ctx.prisma.token.findFirstOrThrow({ where: { programmeItemId: itemId, passOrderId: null } });
      expect(row.visitorCount).toBe(2);

      const r = await ctx.http().get(api(`/events/${eventId}/desk-tickets?date=${today()}`)).set('Authorization', auth);
      expect(r.body.find((x: { id: string }) => x.id === itemId).remaining).toBe(1);
      const a = await ctx.http().get(api(`/public/booking/events/${eventId}/availability?date=${today()}`));
      expect(a.body.tickets.find((x: { id: string }) => x.id === itemId).remaining).toBe(1);

      const full = await ctx.http().post(api(`/events/${eventId}/tokens`)).set('Authorization', auth).send({ programmeItemId: itemId, visitorCount: 2, perPerson: false });
      expect(full.status).toBe(409);
    });

    it('prices tickets by rules for TICKETS / BOTH only', async () => {
      const rule = (body: object) => ctx.http().post(api(`/events/${eventId}/price-rules`)).set('Authorization', auth)
        .send({ kind: 'DATES', dates: [today()], ...body });
      const slotsOnly = await rule({ label: 'Slot peak', appliesTo: 'SLOTS', fixedPrice: '999' });
      expect(slotsOnly.status).toBe(201);
      const desk = async () => (await ctx.http().get(api(`/events/${eventId}/desk-tickets?date=${today()}`)).set('Authorization', auth))
        .body.find((x: { id: string }) => x.id === itemId);
      expect(await desk()).toMatchObject({ price: '100.00', ruleLabel: null });

      const tickets = await rule({ label: 'Show night', appliesTo: 'TICKETS', programmeItemIds: [itemId], upliftPercent: 50 });
      expect(tickets.status).toBe(201);
      expect(tickets.body).toMatchObject({ appliesTo: 'TICKETS', programmeItemIds: [itemId], timeSlotIds: [] });
      expect(await desk()).toMatchObject({ price: '150.00', basePrice: '100.00', ruleLabel: 'Show night' });

      const pv = await ctx.http().get(api(`/events/${eventId}/price-rules/preview`)).set('Authorization', auth);
      const day = pv.body.days.find((d: { date: string }) => d.date === today());
      expect(day.tickets.find((x: { itemId: string }) => x.itemId === itemId)).toMatchObject({ price: '150.00', basePrice: '100.00' });
      // The slot rule still prices the day pass.
      expect(day.slots.find((x: { slotId: string }) => x.slotId === slotId).price).toBe('999.00');
    });
  });

  describe('set-up checklist', () => {
    it('works every step out from the data and hides per member', async () => {
      const m = await makeOrgWithEvent(ctx.prisma);
      const a = bearer(ctx, m.admin);
      const path = api(`/organizations/${m.org.id}/setup-checklist`);
      const r = await ctx.http().get(path).set('Authorization', a);
      expect(r.status).toBe(200);
      const step = (body: { steps: { key: string; done: boolean }[] }, key: string) => body.steps.find((s) => s.key === key)!;
      expect(step(r.body, 'festival').done).toBe(true);
      expect(step(r.body, 'payout')).toMatchObject({ done: false, status: 'NOT_STARTED' });
      expect(step(r.body, 'slots')).toMatchObject({ done: false, link: { kind: 'event', eventId: m.event.id, tab: 'slots' } });
      expect(r.body).toMatchObject({ complete: false, dismissed: false, canDismiss: true, total: r.body.steps.length });

      await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
      expect(step((await ctx.http().get(path).set('Authorization', a)).body, 'payout').done).toBe(true);

      const hidden = await ctx.http().put(`${path}/dismissed`).set('Authorization', a).send({ dismissed: true });
      expect(hidden.status).toBe(200);
      expect(hidden.body.dismissed).toBe(true);
      const shown = await ctx.http().put(`${path}/dismissed`).set('Authorization', a).send({ dismissed: false });
      expect(shown.body.dismissed).toBe(false);
    });

    it('is only for people who can change the mandal settings', async () => {
      // A festival volunteer has no org role: the mandal is hidden from them (404, like other org routes).
      const vol = await makeVolunteer(ctx.prisma, eventId);
      expect((await ctx.http().get(api(`/organizations/${orgId}/setup-checklist`)).set('Authorization', bearer(ctx, vol))).status).toBe(404);
    });
  });
});
