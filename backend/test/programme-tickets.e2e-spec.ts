/** Programme tickets: a programme item sold on its own — price, capacity, date, validity window, gate, organiser guards. */
import { DateTime } from 'luxon';
import { bearer, bootApp, idem, makeOrgWithEvent, makeVolunteer, scan, TestCtx, verifyPayouts } from './helpers';

describe('Programme tickets (e2e)', () => {
  let ctx: TestCtx;
  let eventId: string;
  let auth: string;
  let itemId: string;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;
  const tomorrow = () => DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toISODate()!;
  const order = (body: Record<string, unknown>) => ctx.http().post(api('/public/booking/orders')).send(body);
  const buyer = { buyerName: 'Meena', buyerMobile: '9811111111' };

  beforeAll(async () => {
    ctx = await bootApp();
    const m = await makeOrgWithEvent(ctx.prisma);
    eventId = m.event.id;
    auth = bearer(ctx, m.admin);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${eventId}`)).set('Authorization', auth).send({ publicBookingEnabled: true }).expect(200);
    // A whole-day entry slot alongside the ticketed programme.
    await ctx.http().post(api(`/events/${eventId}/time-slots`)).set('Authorization', auth)
      .send({ label: 'Day entry', startTime: '00:00', endTime: '23:59', price: 20 }).expect(201);
    // Covered by the day pass (not ticketed).
    await ctx.http().post(api(`/events/${eventId}/programme/items`)).set('Authorization', auth)
      .send({ date: today(), startTime: '06:00', endTime: '07:00', title: 'Morning aarti', category: 'PUJA' }).expect(201);
  });
  afterAll(() => ctx.app.close());

  it('needs an end time to sell tickets', async () => {
    const r = await ctx.http().post(api(`/events/${eventId}/programme/items`)).set('Authorization', auth)
      .send({ date: today(), startTime: '19:00', title: 'Dandiya night', ticketed: true, ticketPrice: 100 });
    expect(r.status).toBe(400);
  });

  it('lists the ticketed programme on its day, and day passes say what they include', async () => {
    const r = await ctx.http().post(api(`/events/${eventId}/programme/items`)).set('Authorization', auth)
      .send({ date: today(), startTime: '00:00', endTime: '23:59', title: 'Dandiya night', stage: 'Main ground', ticketed: true, ticketPrice: 100, ticketCapacity: 3 });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ ticketed: true, ticketPrice: '100.00', ticketCapacity: 3, ticket: { price: '100.00' } });
    itemId = r.body.id;

    const a = await ctx.http().get(api(`/public/booking/events/${eventId}/availability?date=${today()}`));
    expect(a.body.tickets).toEqual([expect.objectContaining({ id: itemId, label: 'Dandiya night', price: '100.00', remaining: 3, ended: false, stage: 'Main ground' })]);
    // The day pass covers the aarti but not the separately ticketed show.
    expect(a.body.slots[0].includes).toEqual(['Morning aarti']);
    const other = await ctx.http().get(api(`/public/booking/events/${eventId}/availability?date=${tomorrow()}`));
    expect(other.body.tickets).toEqual([]);

    const pub = await ctx.http().get(api(`/public/events/${eventId}/programme`));
    const shown = pub.body.days.flatMap((d: { items: { id: string; ticket: unknown }[] }) => d.items).find((i: { id: string }) => i.id === itemId);
    expect(shown.ticket).toEqual({ price: '100.00' });
  });

  it('rejects a slot+programme order, the wrong date and an over-capacity order', async () => {
    const slotId = (await ctx.prisma.timeSlot.findFirstOrThrow({ where: { eventId } })).id;
    expect((await order({ eventId, timeSlotId: slotId, programmeItemId: itemId, date: today(), visitorCount: 1, ...buyer })).status).toBe(400);
    expect((await order({ eventId, date: today(), visitorCount: 1, ...buyer })).status).toBe(400);
    expect((await order({ eventId, programmeItemId: itemId, date: tomorrow(), visitorCount: 1, ...buyer })).status).toBe(400);
    const full = await order({ eventId, programmeItemId: itemId, date: today(), visitorCount: 4, ...buyer });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('SLOT_FULL');
  });

  it('sells, holds and mints a ticket valid for the programme, named on the pass and at the gate', async () => {
    const ok = await order({ eventId, programmeItemId: itemId, date: today(), visitorCount: 2, perPersonPasses: false, ...buyer });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ status: 'PENDING', amount: '200.00', timeSlot: { label: 'Dandiya night' }, programme: { id: itemId, title: 'Dandiya night', stage: 'Main ground' } });

    // 2 of 3 held → a 2-person order no longer fits.
    const second = await order({ eventId, programmeItemId: itemId, date: today(), visitorCount: 2, buyerName: 'Ravi', buyerMobile: '9822222222' });
    expect(second.status).toBe(409);

    const paid = await ctx.http().post(api(`/public/booking/orders/${ok.body.id}/demo-pay`)).send({ k: ok.body.accessKey, outcome: 'success' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: 'PAID', pass: { status: 'ACTIVE', admits: 2 } });
    const token = await ctx.prisma.token.findFirstOrThrow({ where: { passOrderId: ok.body.id } });
    expect(token).toMatchObject({ programmeItemId: itemId, timeSlotId: null, visitorCount: 2 });

    const a = await ctx.http().get(api(`/public/booking/events/${eventId}/availability?date=${today()}`));
    expect(a.body.tickets[0].remaining).toBe(1);

    const gate = await makeVolunteer(ctx.prisma, eventId);
    const s = await scan(ctx, bearer(ctx, gate), { eventId, qrPayload: paid.body.pass.qrPayload, idempotencyKey: idem() });
    expect(s.body).toMatchObject({ result: 'SUCCESS', visitorCount: 2, timeSlot: { label: 'Dandiya night' } });

    const admin = await ctx.http().get(api(`/events/${eventId}/programme`)).set('Authorization', auth);
    const row = admin.body.days.flatMap((d: { items: { id: string }[] }) => d.items).find((i: { id: string }) => i.id === itemId);
    expect(row.ticketsSold).toBe(2);

    const list = await ctx.http().get(api(`/events/${eventId}/pass-orders`)).set('Authorization', auth);
    expect(list.body.items.find((o: { id: string }) => o.id === ok.body.id)).toMatchObject({ programme: { title: 'Dandiya night' }, timeSlot: { label: 'Dandiya night' } });

    const rep = await ctx.http().get(api(`/events/${eventId}/reports/tokens`)).set('Authorization', auth);
    expect(rep.body.bySlot).toEqual(expect.arrayContaining([expect.objectContaining({ timeSlotId: itemId, label: 'Dandiya night', total: 1 })]));
  });

  it('stops the organiser moving, shrinking below sales or deleting a sold programme', async () => {
    const path = api(`/events/${eventId}/programme/items/${itemId}`);
    const moved = await ctx.http().patch(path).set('Authorization', auth).send({ startTime: '20:00' });
    expect(moved.status).toBe(409);
    expect(moved.body.code).toBe('TICKETS_SOLD');
    expect((await ctx.http().patch(path).set('Authorization', auth).send({ ticketCapacity: 1 })).status).toBe(400);
    // Price and title can still change; the sold pass keeps what it was bought for.
    const edited = await ctx.http().patch(path).set('Authorization', auth).send({ ticketPrice: 150, ticketCapacity: 10, title: 'Dandiya night (live band)' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ ticketPrice: '150.00', ticketCapacity: 10 });
    expect((await ctx.http().delete(path).set('Authorization', auth)).status).toBe(409);
  });

  it('stops selling a cancelled programme', async () => {
    await ctx.http().patch(api(`/events/${eventId}/programme/items/${itemId}`)).set('Authorization', auth)
      .send({ status: 'CANCELLED', statusNote: 'Rain' }).expect(200);
    const a = await ctx.http().get(api(`/public/booking/events/${eventId}/availability?date=${today()}`));
    expect(a.body.tickets[0]).toMatchObject({ cancelled: true, ended: true, remaining: 0 });
    const r = await order({ eventId, programmeItemId: itemId, date: today(), visitorCount: 1, ...buyer });
    expect(r.status).toBe(400);
  });
});
