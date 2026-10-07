/** Stall booking: vendor accounts, stall types, no overselling, online payment, platform fee split, isolation. */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx, uniqueMobile, verifyPayouts } from './helpers';

const HASH = bcrypt.hashSync('Password@123', 4);

describe('Stall booking (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  /** A vendor + its login, straight in the DB. */
  async function vendor(status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const tag = randomBytes(4).toString('hex');
    const v = await ctx.prisma.vendor.create({ data: { businessName: `Chaat Corner ${tag}`, contactName: 'Ravi', contactEmail: `${tag}@vendor.dev`, contactPhone: '9000000000', status } });
    const user = await ctx.prisma.user.create({ data: { name: `Vendor ${tag}`, mobile: uniqueMobile(), email: `v${tag}@vendor.dev`, passwordHash: HASH, vendorId: v.id } });
    return { vendor: v, user, auth: bearer(ctx, user) };
  }

  /** A live festival with payouts verified and stall booking on, plus one stall type. */
  async function festival(opts: { count?: number; price?: string; gst?: boolean } = {}) {
    const made = await makeOrgWithEvent(ctx.prisma);
    const admin = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    if (opts.gst) await ctx.prisma.event.update({ where: { id: made.event.id }, data: { gstEnabled: true } });
    const ov = await ctx.http().post(api(`/events/${made.event.id}/stall-types`)).set('Authorization', admin)
      .send({ name: 'Food stall', category: 'FOOD', size: '10 × 10 ft', price: opts.price ?? '5000', totalCount: opts.count ?? 3 });
    expect(ov.status).toBe(201);
    await ctx.http().patch(api(`/events/${made.event.id}/stalls`)).set('Authorization', admin).send({ enabled: true }).expect(200);
    return { ...made, admin, typeId: ov.body.types[0].id as string };
  }

  const book = (auth: string, typeId: string, quantity = 1) =>
    ctx.http().post(api('/vendor/bookings')).set('Authorization', auth)
      .send({ stallTypeId: typeId, quantity, businessName: 'Chaat Corner', contactName: 'Ravi', contactPhone: '9876543210', products: 'Pani puri, bhel' });
  const pay = (auth: string, id: string, outcome: 'success' | 'fail' = 'success') =>
    ctx.http().post(api(`/vendor/bookings/${id}/demo-pay`)).set('Authorization', auth).send({ outcome });

  it('vendor signup creates a locked login + an active vendor', async () => {
    const tag = randomBytes(3).toString('hex');
    const r = await ctx.http().post(api('/vendors/signup')).send({
      businessName: 'Masala Dosa Hub', contactName: 'Anita', email: `sign${tag}@vendor.dev`, mobile: uniqueMobile(), password: 'Password@123', category: 'FOOD', city: 'Pune',
    });
    expect(r.status).toBe(201);
    expect(r.body.verificationRequired).toBe(true);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email: `sign${tag}@vendor.dev` }, include: { vendor: true } });
    expect(u.requiresEmailVerification).toBe(true);
    expect(u.vendor).toMatchObject({ businessName: 'Masala Dosa Hub', status: 'ACTIVE', category: 'FOOD' });
    const login = await ctx.http().post(api('/auth/login')).send({ identifier: `sign${tag}@vendor.dev`, password: 'Password@123' });
    expect(login.status).toBe(403);
  });

  it('vendor area is vendor-only; vendors see no mandal routes; /auth/me exposes the vendor', async () => {
    const f = await festival();
    const v = await vendor();
    expect((await ctx.http().get(api('/vendor/bookings')).set('Authorization', f.admin)).body.code).toBe('NOT_A_VENDOR');
    expect((await ctx.http().get(api(`/events/${f.event.id}/stalls`)).set('Authorization', v.auth)).status).toBe(404);
    const me = await ctx.http().get(api('/auth/me')).set('Authorization', v.auth);
    expect(me.body.vendor).toMatchObject({ id: v.vendor.id, status: 'ACTIVE' });
  });

  it('books, holds stalls during payment, never oversells, and frees expired holds', async () => {
    const f = await festival({ count: 3 });
    const a = await vendor();
    const b = await vendor();
    const first = await book(a.auth, f.typeId, 2);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ status: 'PENDING', quantity: 2, amount: '10000.00', paymentProvider: 'demo' });
    const pub = await ctx.http().get(api(`/public/events/${f.event.id}/stalls`));
    expect(pub.body).toMatchObject({ open: true });
    expect(pub.body.types[0]).toMatchObject({ totalCount: 3, booked: 2, available: 1 });
    const tooMany = await book(b.auth, f.typeId, 2);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body).toMatchObject({ code: 'STALLS_SOLD_OUT', available: 1 });
    // The first hold lapses → its stalls come back even before any sweeper runs.
    await ctx.prisma.stallBooking.update({ where: { id: first.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await book(b.auth, f.typeId, 2)).status).toBe(201);
    const late = await pay(a.auth, first.body.id);
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('BOOKING_EXPIRED');
    expect((await ctx.prisma.stallBooking.findUniqueOrThrow({ where: { id: first.body.id } })).status).toBe('EXPIRED');
  });

  it('two vendors racing for the last stall: exactly one hold', async () => {
    const f = await festival({ count: 1 });
    const [a, b] = await Promise.all([vendor(), vendor()]);
    const res = await Promise.all([book(a.auth, f.typeId), book(b.auth, f.typeId)]);
    expect(res.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('payment: invoice, platform fee on the rent (not GST) into settlements and earnings', async () => {
    const f = await festival({ price: '4000', gst: true });
    await ctx.prisma.orgBilling.update({ where: { organizationId: f.org.id }, data: { stallCommissionBps: 1000 } });
    const v = await vendor();
    const b = await book(v.auth, f.typeId, 2);
    // 2 × 4000 = 8000 rent + 18% GST 1440 = 9440; platform 10% of 8000 = 800.
    expect(b.body).toMatchObject({ base: '8000.00', gstPercent: '18', gst: '1440.00', amount: '9440.00' });
    const paid = await pay(v.auth, b.body.id);
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.invoiceNo).toMatch(/^TST-STL-\d{4}-00001$/);
    expect((await pay(v.auth, b.body.id)).body.status).toBe('PAID'); // idempotent
    const s = await ctx.prisma.paymentSettlement.findUniqueOrThrow({ where: { sourceId: b.body.id } });
    expect(s).toMatchObject({ sourceType: 'STALL_BOOKING', grossPaise: 944000, commissionPaise: 80000, gstPaise: 144000, netPaise: 944000 - 80000 - s.gatewayFeePaise });
    const sum = await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa);
    expect(Number(sum.body.stallFeesEarned)).toBeGreaterThanOrEqual(800);
    const mandalView = await ctx.http().get(api(`/events/${f.event.id}/stall-bookings?status=PAID`)).set('Authorization', f.admin);
    expect(mandalView.body.items[0]).toMatchObject({ id: b.body.id, platformFee: '800.00', commissionPercent: '10.00', businessName: 'Chaat Corner' });
  });

  it('a failed payment frees the stalls; settlement only on success', async () => {
    const f = await festival({ count: 1 });
    const v = await vendor();
    const b = await book(v.auth, f.typeId);
    expect((await pay(v.auth, b.body.id, 'fail')).body.status).toBe('FAILED');
    expect(await ctx.prisma.paymentSettlement.count({ where: { sourceId: b.body.id } })).toBe(0);
    expect((await book(v.auth, f.typeId)).status).toBe(201);
  });

  it('mandal rules: count can’t drop below booked, used types can’t be deleted, stall numbers after payment', async () => {
    const f = await festival({ count: 3 });
    const v = await vendor();
    const b = await book(v.auth, f.typeId, 2);
    const low = await ctx.http().patch(api(`/events/${f.event.id}/stall-types/${f.typeId}`)).set('Authorization', f.admin).send({ totalCount: 1 });
    expect(low.body.code).toBe('STALL_COUNT_TOO_LOW');
    expect((await ctx.http().delete(api(`/events/${f.event.id}/stall-types/${f.typeId}`)).set('Authorization', f.admin)).body.code).toBe('STALL_TYPE_IN_USE');
    expect((await ctx.http().patch(api(`/events/${f.event.id}/stall-bookings/${b.body.id}`)).set('Authorization', f.admin).send({ stallNumbers: 'F-01, F-02' })).body.code).toBe('BOOKING_NOT_PAID');
    await pay(v.auth, b.body.id);
    const set = await ctx.http().patch(api(`/events/${f.event.id}/stall-bookings/${b.body.id}`)).set('Authorization', f.admin).send({ stallNumbers: 'F-01, F-02', mandalNote: 'Gate 2' });
    expect(set.body).toMatchObject({ stallNumbers: 'F-01, F-02' });
    expect((await ctx.http().get(api(`/vendor/bookings/${b.body.id}`)).set('Authorization', v.auth)).body).toMatchObject({ stallNumbers: 'F-01, F-02', mandalNote: 'Gate 2' });
    // Another vendor can't see it.
    expect((await ctx.http().get(api(`/vendor/bookings/${b.body.id}`)).set('Authorization', (await vendor()).auth)).status).toBe(404);
  });

  it('festival list needs live + booking on + verified payouts; open-booking limit; suspended vendor is read-only', async () => {
    const f = await festival({ count: 20 });
    const noPayouts = await makeOrgWithEvent(ctx.prisma);
    const npAdmin = bearer(ctx, noPayouts.admin);
    await ctx.http().post(api(`/events/${noPayouts.event.id}/stall-types`)).set('Authorization', npAdmin).send({ name: 'Shop', category: 'SHOPPING', price: '100', totalCount: 5 });
    await ctx.http().patch(api(`/events/${noPayouts.event.id}/stalls`)).set('Authorization', npAdmin).send({ enabled: true });
    const v = await vendor();
    const list = await ctx.http().get(api('/vendor/festivals?pageSize=200')).set('Authorization', v.auth);
    const ids = list.body.items.map((e: { id: string }) => e.id);
    expect(ids).toContain(f.event.id);
    expect(ids).not.toContain(noPayouts.event.id);
    for (let i = 0; i < 3; i++) expect((await book(v.auth, f.typeId)).status).toBe(201);
    expect((await book(v.auth, f.typeId)).body.code).toBe('TOO_MANY_OPEN_BOOKINGS');
    const s = await vendor('SUSPENDED');
    expect((await book(s.auth, f.typeId)).body.code).toBe('VENDOR_SUSPENDED');
    expect((await ctx.http().get(api('/vendor/bookings')).set('Authorization', s.auth)).status).toBe(200);
    const sus = await ctx.http().post(api(`/platform/vendors/${v.vendor.id}/status`)).set('Authorization', sa).send({ status: 'SUSPENDED', note: 'Test' });
    expect(sus.body.status).toBe('SUSPENDED');
  });
});
