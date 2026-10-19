/**
 * Selling passes before the festival starts, and the mandal's online sales window
 * ("passes on sale from …" / "online sales close at …").
 */
import { bearer, bootApp, makeOrgWithEvent, TestCtx, verifyPayouts } from './helpers';

describe('Advance sales & booking window (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

  /** The user's case: approved and live today, festival starts in 10 days, booking switched on, one paid slot. */
  async function futureFestival() {
    const m = await makeOrgWithEvent(ctx.prisma);
    await ctx.prisma.event.update({ where: { id: m.event.id }, data: { startDate: new Date(`${day(10)}T00:00:00Z`), endDate: new Date(`${day(15)}T00:00:00Z`) } });
    const auth = bearer(ctx, m.admin);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', auth).send({ publicBookingEnabled: true }).expect(200);
    const slot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', auth)
      .send({ label: 'Evening', startTime: '18:00', endTime: '22:00', capacity: 50, price: 100 });
    return { ...m, auth, slotId: slot.body.id as string };
  }
  const order = (eventId: string, timeSlotId: string, date: string) =>
    ctx.http().post(api('/public/booking/orders')).send({ eventId, timeSlotId, date, visitorCount: 2, buyerName: 'Meena', buyerMobile: '9811111111' });

  it('sells passes today for a festival that starts in 10 days (no window set)', async () => {
    const f = await futureFestival();
    const ev = await ctx.http().get(api(`/public/booking/events/${f.event.id}`));
    expect(ev.body).toMatchObject({ startDate: day(10), salesState: 'OPEN', bookingOpensAt: null });
    const avail = await ctx.http().get(api(`/public/booking/events/${f.event.id}/availability?date=${day(12)}`));
    expect(avail.body.slots[0]).toMatchObject({ remaining: 50, ended: false });
    const o = await order(f.event.id, f.slotId, day(12));
    expect(o.status).toBe(201);
    expect(o.body.status).toBe('PENDING');
    // Days before the festival itself still aren't valid pass dates.
    expect((await order(f.event.id, f.slotId, day(3))).status).toBe(400);
  });

  it('keeps online sales shut until "sales open", and after "sales close"', async () => {
    const f = await futureFestival();
    const opens = new Date(Date.now() + 2 * 86400000);
    await ctx.http().patch(api(`/events/${f.event.id}`)).set('Authorization', f.auth).send({ bookingOpensAt: opens.toISOString() }).expect(200);

    const pub = await ctx.http().get(api(`/public/events/${f.event.id}`));
    expect(pub.body).toMatchObject({ salesState: 'NOT_YET', bookingOpensAt: opens.toISOString() });
    const list = await ctx.http().get(api('/public/booking/events'));
    expect(list.body.find((e: { id: string }) => e.id === f.event.id)).toMatchObject({ salesState: 'NOT_YET' });
    const early = await order(f.event.id, f.slotId, day(12));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('SALES_NOT_OPEN');
    expect(early.body.message).toMatch(/go on sale on/);

    // Window open now (opened an hour ago, closes tomorrow).
    await ctx.http().patch(api(`/events/${f.event.id}`)).set('Authorization', f.auth)
      .send({ bookingOpensAt: new Date(Date.now() - 3600_000).toISOString(), bookingClosesAt: new Date(Date.now() + 86400000).toISOString() }).expect(200);
    expect((await order(f.event.id, f.slotId, day(12))).status).toBe(201);

    // Closed.
    await ctx.http().patch(api(`/events/${f.event.id}`)).set('Authorization', f.auth).send({ bookingClosesAt: new Date(Date.now() - 60_000).toISOString() }).expect(200);
    const late = await order(f.event.id, f.slotId, day(12));
    expect(late.body.code).toBe('SALES_CLOSED');

    // Clearing both reopens.
    await ctx.http().patch(api(`/events/${f.event.id}`)).set('Authorization', f.auth).send({ bookingOpensAt: null, bookingClosesAt: null }).expect(200);
    expect((await order(f.event.id, f.slotId, day(13))).status).toBe(201);
  });

  it('rejects a window that closes before it opens', async () => {
    const f = await futureFestival();
    const r = await ctx.http().patch(api(`/events/${f.event.id}`)).set('Authorization', f.auth)
      .send({ bookingOpensAt: new Date(Date.now() + 86400000).toISOString(), bookingClosesAt: new Date().toISOString() });
    expect(r.status).toBe(400);
  });
});
