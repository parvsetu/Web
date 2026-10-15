/** Blogger referrals: signup, review, per-event codes, commission once per paid booking, reversal, payouts, isolation. */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx, uniqueMobile, verifyPayouts } from './helpers';

const HASH = bcrypt.hashSync('Password@123', 4);

describe('Blogger referrals (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;

  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
    // Known default: 10% of the ticket value.
    await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ referralCommissionMode: 'PERCENT', referralCommissionValue: '10' }).expect(200);
  });
  afterAll(() => ctx.app.close());

  /** A live festival taking paid online bookings: ₹100 per person, 50 places. */
  async function festival() {
    const made = await makeOrgWithEvent(ctx.prisma);
    const admin = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    await ctx.http().patch(api(`/events/${made.event.id}`)).set('Authorization', admin).send({ publicBookingEnabled: true }).expect(200);
    const slot = await ctx.http().post(api(`/events/${made.event.id}/time-slots`)).set('Authorization', admin)
      .send({ label: 'All day', startTime: '00:00', endTime: '23:59', capacity: 50, price: 100 });
    return { ...made, adminAuth: admin, slotId: slot.body.id as string };
  }

  /** An approved blogger with an approved promotion on `eventId`. */
  async function blogger(eventId: string, opts: { phone?: string } = {}) {
    const tag = randomBytes(4).toString('hex');
    const phone = opts.phone ?? uniqueMobile();
    const b = await ctx.prisma.blogger.create({ data: { name: `Priya ${tag}`, email: `b${tag}@blog.dev`, phone, instagramHandle: '@priya', status: 'ACTIVE' } });
    const user = await ctx.prisma.user.create({ data: { name: b.name, mobile: uniqueMobile(), email: `u${tag}@blog.dev`, passwordHash: HASH, bloggerId: b.id } });
    const ev = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const p = await ctx.prisma.bloggerPromotion.create({ data: { bloggerId: b.id, eventId, organizationId: ev.organizationId } });
    const r = await ctx.http().post(api(`/platform/blogger-promotions/${p.id}/review`)).set('Authorization', sa).send({ decision: 'APPROVE' });
    expect(r.status).toBe(200);
    return { blogger: b, auth: bearer(ctx, user), promotionId: p.id, code: r.body.code as string, link: r.body.link as string };
  }

  // Each booking from its own IP so the public 10/min order limit never trips.
  let ip = 0;
  const order = (f: { event: { id: string }; slotId: string }, extra: Record<string, unknown> = {}) =>
    ctx.http().post(api('/public/booking/orders')).set('X-Forwarded-For', `10.77.${Math.floor(++ip / 250)}.${ip % 250}`).send({ eventId: f.event.id, timeSlotId: f.slotId, date: today(), visitorCount: 2, buyerName: 'Meena', buyerMobile: uniqueMobile(), ...extra });
  const pay = (o: { id: string; accessKey: string }) => ctx.http().post(api(`/public/booking/orders/${o.id}/demo-pay`)).send({ k: o.accessKey, outcome: 'success' });

  it('signup needs a channel and a live festival; the account waits for review and is blogger-only', async () => {
    const f = await festival();
    const tag = randomBytes(3).toString('hex');
    const base = { name: 'Asha Vlogs', email: `s${tag}@blog.dev`, mobile: uniqueMobile(), password: 'Password@123', eventIds: [f.event.id] };
    expect((await ctx.http().post(api('/bloggers/signup')).send(base)).body.code).toBe('CHANNEL_REQUIRED');
    const { event: draft } = await makeOrgWithEvent(ctx.prisma, { approvalStatus: 'SUBMITTED' });
    expect((await ctx.http().post(api('/bloggers/signup')).send({ ...base, youtubeUrl: 'https://youtube.com/@asha', eventIds: [draft.id] })).body.code).toBe('EVENT_NOT_PROMOTABLE');
    // Clients can't approve themselves or set commission at signup.
    expect((await ctx.http().post(api('/bloggers/signup')).send({ ...base, youtubeUrl: 'https://youtube.com/@asha', status: 'ACTIVE' })).status).toBe(400);
    const ok = await ctx.http().post(api('/bloggers/signup')).send({ ...base, youtubeUrl: 'https://youtube.com/@asha', instagramHandle: 'asha.vlogs' });
    expect(ok.status).toBe(201);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email: base.email }, include: { blogger: { include: { promotions: true } } } });
    expect(u.requiresEmailVerification).toBe(true);
    expect(u.blogger).toMatchObject({ status: 'PENDING', instagramHandle: '@asha.vlogs' });
    expect(u.blogger!.promotions).toHaveLength(1);
    expect(u.blogger!.promotions[0]).toMatchObject({ status: 'PENDING', code: null });

    // A pending blogger's promotion can't be approved; mandal admins aren't bloggers; bloggers see no mandal routes.
    const p = u.blogger!.promotions[0];
    expect((await ctx.http().post(api(`/platform/blogger-promotions/${p.id}/review`)).set('Authorization', sa).send({ decision: 'APPROVE' })).body.code).toBe('BLOGGER_NOT_ACTIVE');
    expect((await ctx.http().get(api('/blogger/me')).set('Authorization', f.adminAuth)).body.code).toBe('NOT_A_BLOGGER');
    const verifiedUser = await ctx.prisma.user.update({ where: { id: u.id }, data: { requiresEmailVerification: false, emailVerifiedAt: new Date() } });
    const bAuth = bearer(ctx, verifiedUser);
    expect((await ctx.http().get(api(`/events/${f.event.id}/pass-orders`)).set('Authorization', bAuth)).status).toBe(404);
    const me = await ctx.http().get(api('/blogger/me')).set('Authorization', bAuth);
    expect(me.body).toMatchObject({ blogger: { status: 'PENDING' }, stats: { pending: 1, approved: 0 } });
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', bAuth)).body.blogger).toMatchObject({ status: 'PENDING' });

    // Approve the blogger, then the promotion → a code and a /f/<event>?ref= link.
    expect((await ctx.http().patch(api(`/platform/bloggers/${u.blogger!.id}/status`)).set('Authorization', sa).send({ status: 'ACTIVE' })).status).toBe(200);
    const ap = await ctx.http().post(api(`/platform/blogger-promotions/${p.id}/review`)).set('Authorization', sa).send({ decision: 'APPROVE', commissionMode: 'FIXED', commissionValue: '25' });
    expect(ap.status).toBe(200);
    expect(ap.body.code).toMatch(/^ASHAVL/);
    expect(ap.body.link).toContain(`/f/${f.event.id}?ref=${ap.body.code}`);
    expect(ap.body.commission).toMatchObject({ mode: 'FIXED', amount: '25.00', custom: true });
    // Asking again for the same festival is refused.
    expect((await ctx.http().post(api('/blogger/promotions')).set('Authorization', bAuth).send({ eventId: f.event.id })).body.code).toBe('ALREADY_REQUESTED');
  });

  it('credits the commission once, only after payment, and the code only works on its own festival', async () => {
    const f = await festival();
    const other = await festival();
    const b = await blogger(f.event.id);

    expect((await ctx.http().get(api(`/public/booking/events/${f.event.id}/referral?code=${b.code.toLowerCase()}`))).body).toMatchObject({ code: b.code, bloggerName: b.blogger.name });
    expect((await ctx.http().get(api(`/public/booking/events/${other.event.id}/referral?code=${b.code}`))).status).toBe(404);

    // Wrong festival: booking goes through, nothing attributed.
    const elsewhere = await order(other, { referralCode: b.code });
    expect(elsewhere.status).toBe(201);
    expect(elsewhere.body.referral).toBeNull();

    const o = await order(f, { referralCode: b.code.toLowerCase() });
    expect(o.status).toBe(201);
    expect(o.body.referral).toMatchObject({ bloggerName: b.blogger.name });
    // Nothing is earned while the booking is unpaid.
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { bloggerId: b.blogger.id } })).toBe(0);

    // Two simultaneous confirmations → one pass set, one commission (10% of ₹200).
    await Promise.all([pay(o.body), pay(o.body)]);
    const rows = await ctx.prisma.referralLedgerEntry.findMany({ where: { bloggerId: b.blogger.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'EARNED', amountPaise: 2000, passOrderId: o.body.id });
    const me = await ctx.http().get(api('/blogger/me')).set('Authorization', b.auth);
    expect(me.body.earnings).toMatchObject({ earned: '20.00', due: '20.00' });
    expect(me.body.stats).toMatchObject({ referrals: 1, paidBookings: 1, visitors: 2 });

    // The ledger shows the booking but not the buyer.
    const ledger = await ctx.http().get(api('/blogger/ledger')).set('Authorization', b.auth);
    expect(JSON.stringify(ledger.body)).not.toContain('Meena');

    // Failed payment earns nothing.
    const failed = await order(f, { referralCode: b.code });
    await ctx.http().post(api(`/public/booking/orders/${failed.body.id}/demo-pay`)).send({ k: failed.body.accessKey, outcome: 'fail' }).expect(200);
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { bloggerId: b.blogger.id } })).toBe(1);

    // The mandal sees which blogger brought the booking.
    const list = await ctx.http().get(api(`/events/${f.event.id}/pass-orders`)).set('Authorization', f.adminAuth);
    expect(list.body.items.find((x: { id: string }) => x.id === o.body.id).referral).toMatchObject({ code: b.code, bloggerName: b.blogger.name });
  });

  it('ignores self-referral, revoked promotions and suspended bloggers', async () => {
    const f = await festival();
    const phone = uniqueMobile();
    const b = await blogger(f.event.id, { phone });
    const self = await order(f, { referralCode: b.code, buyerMobile: `+91${phone.slice(-10)}` });
    expect(self.body.referral).toBeNull();

    // Placed with a live code, then the blogger is suspended before payment → no commission.
    const o = await order(f, { referralCode: b.code });
    expect(o.body.referral).not.toBeNull();
    await ctx.http().patch(api(`/platform/bloggers/${b.blogger.id}/status`)).set('Authorization', sa).send({ status: 'SUSPENDED', note: 'Spam' }).expect(200);
    await pay(o.body).expect(200);
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { bloggerId: b.blogger.id } })).toBe(0);
    expect((await ctx.http().post(api('/blogger/promotions')).set('Authorization', b.auth).send({ eventId: f.event.id })).body.code).toBe('BLOGGER_INACTIVE');

    await ctx.http().patch(api(`/platform/bloggers/${b.blogger.id}/status`)).set('Authorization', sa).send({ status: 'ACTIVE' }).expect(200);
    await ctx.http().post(api(`/platform/blogger-promotions/${b.promotionId}/review`)).set('Authorization', sa).send({ decision: 'REVOKE' }).expect(200);
    expect((await order(f, { referralCode: b.code })).body.referral).toBeNull();
    // Re-approving keeps the same code, so shared links work again.
    const again = await ctx.http().post(api(`/platform/blogger-promotions/${b.promotionId}/review`)).set('Authorization', sa).send({ decision: 'APPROVE' });
    expect(again.body.code).toBe(b.code);
  });

  it('free bookings earn nothing', async () => {
    const f = await festival();
    const slot = await ctx.http().post(api(`/events/${f.event.id}/time-slots`)).set('Authorization', f.adminAuth)
      .send({ label: 'Free', startTime: '00:00', endTime: '23:59', capacity: 10, price: 0 });
    const b = await blogger(f.event.id);
    const o = await order({ event: f.event, slotId: slot.body.id }, { referralCode: b.code });
    expect(o.body.status).toBe('PAID');
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { bloggerId: b.blogger.id } })).toBe(0);
  });

  it('reverses when every pass of the booking is cancelled (concurrently, once), and by the super admin', async () => {
    const f = await festival();
    const b = await blogger(f.event.id);
    const o = await order(f, { referralCode: b.code });
    await pay(o.body).expect(200);
    const tokens = await ctx.prisma.token.findMany({ where: { passOrderId: o.body.id } });
    expect(tokens).toHaveLength(2);
    // Cancelling one pass leaves the booking standing.
    await ctx.http().post(api(`/events/${f.event.id}/tokens/${tokens[0].id}/cancel`)).set('Authorization', f.adminAuth).send({ reason: 'Visitor could not come' }).expect(200);
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { bloggerId: b.blogger.id, type: 'REVERSED' } })).toBe(0);
    await ctx.http().post(api(`/events/${f.event.id}/tokens/${tokens[1].id}/cancel`)).set('Authorization', f.adminAuth).send({ reason: 'Visitor could not come' }).expect(200);
    const rev = await ctx.prisma.referralLedgerEntry.findMany({ where: { bloggerId: b.blogger.id, type: 'REVERSED' } });
    expect(rev).toHaveLength(1);
    expect((await ctx.http().get(api('/blogger/me')).set('Authorization', b.auth)).body.earnings).toMatchObject({ earned: '0.00', reversed: '20.00', due: '0.00' });

    // Concurrent cancellation of the last two passes still reverses exactly once.
    const o2 = await order(f, { referralCode: b.code });
    await pay(o2.body).expect(200);
    const t2 = await ctx.prisma.token.findMany({ where: { passOrderId: o2.body.id } });
    await Promise.all(t2.map((t) => ctx.http().post(api(`/events/${f.event.id}/tokens/${t.id}/cancel`)).set('Authorization', f.adminAuth).send({ reason: 'Booking cancelled' })));
    expect(await ctx.prisma.referralLedgerEntry.count({ where: { passOrderId: o2.body.id, type: 'REVERSED' } })).toBe(1);

    // Off-platform refund: the super admin reverses, once.
    const o3 = await order(f, { referralCode: b.code });
    await pay(o3.body).expect(200);
    const earned = await ctx.prisma.referralLedgerEntry.findFirstOrThrow({ where: { passOrderId: o3.body.id, type: 'EARNED' } });
    expect((await ctx.http().post(api(`/platform/referral-ledger/${earned.id}/reverse`)).set('Authorization', sa).send({ reason: 'Refunded at the desk' })).status).toBe(200);
    expect((await ctx.http().post(api(`/platform/referral-ledger/${earned.id}/reverse`)).set('Authorization', sa).send({ reason: 'Refunded at the desk' })).body.code).toBe('ALREADY_REVERSED');
  });

  it('payouts never exceed what is due; report adds up', async () => {
    const f = await festival();
    const b = await blogger(f.event.id);
    for (let i = 0; i < 2; i++) {
      const o = await order(f, { referralCode: b.code });
      await pay(o.body).expect(200);
    }
    const tooMuch = await ctx.http().post(api(`/platform/bloggers/${b.blogger.id}/payouts`)).set('Authorization', sa).send({ amount: '40.01', paidOn: today(), reference: 'UPI 1' });
    expect(tooMuch.body.code).toBe('PAYOUT_EXCEEDS_DUE');
    const paid = await ctx.http().post(api(`/platform/bloggers/${b.blogger.id}/payouts`)).set('Authorization', sa).send({ amount: '30', paidOn: today(), reference: 'UPI 1' });
    expect(paid.body.earnings).toMatchObject({ earned: '40.00', paid: '30.00', due: '10.00' });

    const rep = await ctx.http().get(api(`/platform/referrals/report?bloggerId=${b.blogger.id}`)).set('Authorization', sa);
    expect(rep.body.items).toHaveLength(1);
    expect(rep.body.items[0]).toMatchObject({ code: b.code, referrals: 2, paidBookings: 2, visitors: 4, gross: '400.00', commissionNet: '40.00' });
    expect(rep.body.totals).toMatchObject({ paidOut: '30.00', commissionNet: '40.00' });
    const csv = await ctx.http().get(api(`/platform/referrals/report?bloggerId=${b.blogger.id}&format=csv`)).set('Authorization', sa);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(b.code);
    // Not for bloggers.
    expect((await ctx.http().get(api('/platform/referrals/report')).set('Authorization', b.auth)).status).toBe(403);
  });
});
