/** Web push: self-made VAPID keys, visitor pass subscriptions (access key), one reminder per order, gone endpoints removed, user alerts. */
jest.mock('web-push', () => {
  const actual = jest.requireActual('web-push');
  return { ...actual, sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }) };
});
import * as webpush from 'web-push';
import { DateTime } from 'luxon';
import { randomBytes } from 'crypto';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx, uniqueMobile, verifyPayouts } from './helpers';
import { PushService } from '../src/modules/push/push.service';

const send = webpush.sendNotification as jest.Mock;

describe('Web push (e2e)', () => {
  let ctx: TestCtx;
  let push: PushService;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;
  let ip = 0;
  const sub = (lang = 'en') => ({ endpoint: `https://push.example.test/${randomBytes(12).toString('hex')}`, keys: { p256dh: 'BPx'.padEnd(87, 'A'), auth: 'auth-secret-123' }, lang });

  beforeAll(async () => {
    ctx = await bootApp();
    push = ctx.app.get(PushService);
  });
  afterAll(() => ctx.app.close());
  beforeEach(() => send.mockClear());

  /** A paid 2-person order on a live festival (all-day slot). */
  async function paidOrder() {
    const made = await makeOrgWithEvent(ctx.prisma);
    const admin = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    await ctx.http().patch(api(`/events/${made.event.id}`)).set('Authorization', admin).send({ publicBookingEnabled: true }).expect(200);
    const slot = await ctx.http().post(api(`/events/${made.event.id}/time-slots`)).set('Authorization', admin).send({ label: 'All day', startTime: '00:00', endTime: '23:59', capacity: 50, price: 100 });
    const o = await ctx.http().post(api('/public/booking/orders')).set('X-Forwarded-For', `10.66.0.${++ip}`)
      .send({ eventId: made.event.id, timeSlotId: slot.body.id, date: today(), visitorCount: 2, buyerName: 'Meena', buyerMobile: uniqueMobile() });
    await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' }).expect(200);
    return { ...made, admin, orderId: o.body.id as string, k: o.body.accessKey as string };
  }

  it('makes its own key pair once, private key encrypted', async () => {
    const a = await ctx.http().get(api('/public/push/key'));
    const b = await ctx.http().get(api('/public/push/key'));
    expect(a.body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b.body.publicKey).toBe(a.body.publicKey);
    const row = await ctx.prisma.pushKeys.findUniqueOrThrow({ where: { id: 'default' } });
    expect(row.privateKeyEnc.startsWith('v1.')).toBe(true);
  });

  it('visitor reminder: needs the access key, goes out once in the visitor’s language, gone phones are removed', async () => {
    const o = await paidOrder();
    const s = sub('hi');
    expect((await ctx.http().post(api(`/public/booking/orders/${o.orderId}/push`)).send({ k: 'x'.repeat(32), subscription: s })).status).toBe(404);
    expect((await ctx.http().post(api(`/public/booking/orders/${o.orderId}/push`)).send({ k: o.k, subscription: { ...s, endpoint: 'http://insecure.test/x' } })).status).toBe(400);
    await ctx.http().post(api(`/public/booking/orders/${o.orderId}/push`)).send({ k: o.k, subscription: s }).expect(200);

    // The pass window started today at 00:00 IST and runs till 23:59 → due now.
    await push.sendDueReminders();
    const mine = send.mock.calls.filter((c) => c[0].endpoint === s.endpoint);
    expect(mine).toHaveLength(1);
    const msg = JSON.parse(mine[0][1]);
    expect(msg.title).toContain('के लिए आपका पास');
    expect(msg.url).toBe(`/pass/${o.orderId}?k=${encodeURIComponent(o.k)}`);
    expect((await ctx.prisma.passOrder.findUniqueOrThrow({ where: { id: o.orderId } })).reminderSentAt).not.toBeNull();

    // Never twice — even when two sweeps race.
    send.mockClear();
    await Promise.all([push.sendDueReminders(), push.sendDueReminders()]);
    expect(send.mock.calls.filter((c) => c[0].endpoint === s.endpoint)).toHaveLength(0);

    // A phone the push service says is gone is deleted.
    const o2 = await paidOrder();
    const gone = sub();
    await ctx.http().post(api(`/public/booking/orders/${o2.orderId}/push`)).send({ k: o2.k, subscription: gone }).expect(200);
    send.mockImplementation(async (s2: { endpoint: string }) => {
      if (s2.endpoint === gone.endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    });
    await push.sendDueReminders();
    send.mockResolvedValue({ statusCode: 201 });
    expect(await ctx.prisma.pushSubscription.count({ where: { endpoint: gone.endpoint } })).toBe(0);
  });

  it('signed-in phones: subscribe, status, unsubscribe; a stall cancellation reaches the vendor’s phone', async () => {
    const u = await makeUser(ctx.prisma);
    const auth = bearer(ctx, u);
    const s = sub();
    await ctx.http().post(api('/push/subscriptions')).set('Authorization', auth).send(s).expect(200);
    expect((await ctx.http().get(api(`/push/subscriptions/status?endpoint=${encodeURIComponent(s.endpoint)}`)).set('Authorization', auth)).body.subscribed).toBe(true);
    await push.sendToUser(u.id, { title: 'Hello', body: 'Test', url: '/dashboard' });
    expect(send.mock.calls.filter((c) => c[0].endpoint === s.endpoint)).toHaveLength(1);
    await ctx.http().post(api('/public/push/unsubscribe')).send({ endpoint: s.endpoint }).expect(200);
    expect((await ctx.http().get(api(`/push/subscriptions/status?endpoint=${encodeURIComponent(s.endpoint)}`)).set('Authorization', auth)).body.subscribed).toBe(false);
    expect((await ctx.http().post(api('/push/subscriptions')).send(s)).status).toBe(401);

    // Vendor: book + pay a stall, mandal cancels → push to the vendor's phone.
    const made = await makeOrgWithEvent(ctx.prisma);
    const admin = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    const types = await ctx.http().post(api(`/events/${made.event.id}/stall-types`)).set('Authorization', admin).send({ name: 'Food stall', category: 'FOOD', price: '1000', totalCount: 2 });
    await ctx.http().patch(api(`/events/${made.event.id}/stalls`)).set('Authorization', admin).send({ enabled: true }).expect(200);
    const tag = randomBytes(4).toString('hex');
    const v = await ctx.prisma.vendor.create({ data: { businessName: `Chaat ${tag}`, contactName: 'Ravi', contactEmail: `${tag}@v.dev`, contactPhone: '9000000000' } });
    const vu = await ctx.prisma.user.create({ data: { name: 'Vendor', mobile: uniqueMobile(), email: `vu${tag}@v.dev`, passwordHash: 'x', vendorId: v.id } });
    const vAuth = bearer(ctx, vu);
    const vs = sub();
    await ctx.http().post(api('/push/subscriptions')).set('Authorization', vAuth).send(vs).expect(200);
    const b = await ctx.http().post(api('/vendor/bookings')).set('Authorization', vAuth).send({ stallTypeId: types.body.types[0].id, quantity: 1, businessName: 'Chaat', contactName: 'Ravi', contactPhone: '9876543210' });
    await ctx.http().post(api(`/vendor/bookings/${b.body.id}/demo-pay`)).set('Authorization', vAuth).send({ outcome: 'success' }).expect(200);
    send.mockClear();
    await ctx.http().post(api(`/events/${made.event.id}/stall-bookings/${b.body.id}/cancel`)).set('Authorization', admin).send({ reason: 'Rain — ground closed' }).expect(200);
    const toVendor = send.mock.calls.filter((c) => c[0].endpoint === vs.endpoint);
    expect(toVendor).toHaveLength(1);
    expect(JSON.parse(toVendor[0][1])).toMatchObject({ title: expect.stringContaining('Stall booking cancelled'), url: '/vendor' });
  });
});
