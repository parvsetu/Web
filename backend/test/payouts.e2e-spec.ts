/** Payout accounts (registered + unregistered), settlements/payouts, shareable donation receipts. */
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, makeOrgWithEvent, makeUser, makeVolunteer, TestCtx } from './helpers';

const REGISTERED = {
  entityType: 'REGISTERED', registeredType: 'TRUST', legalName: 'Shree Ganesh Trust', registrationNumber: 'MH/1234/2010',
  orgPan: 'aaats1234z', reg80G: '80G-123', addressLine: 'Lalbaug Road', city: 'Mumbai', state: 'mh', pincode: '400012',
  contactName: 'Ravi', contactRole: 'Treasurer', contactPhone: '9876543210', contactEmail: 'ravi@test.dev', signatoryPan: 'ABCDE1234F',
  bankHolderName: 'Shree Ganesh Trust', bankAccount: '1234 5678 9012', ifsc: 'sbin0001234', accountType: 'CURRENT', consent: true,
};

describe('Payout accounts, split settlements, receipts (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  it('registered and unregistered mandals submit accounts; numbers are masked and encrypted', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const put = (b: object) => ctx.http().put(api(`/organizations/${m.org.id}/payout-account`)).set('Authorization', auth).send(b);
    expect((await put({ ...REGISTERED, orgPan: undefined })).status).toBe(400);
    expect((await put({ ...REGISTERED, ifsc: 'SBIN1234' })).status).toBe(400);
    expect((await put({ ...REGISTERED, consent: false })).status).toBe(400);
    const ok = await put(REGISTERED);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'PENDING', state: 'Maharashtra', ifsc: 'SBIN0001234', bankAccount: 'XXXXXX9012', orgPan: 'XXXXXX234Z', signatoryPan: 'XXXXXX234F' });
    const row = await ctx.prisma.payoutAccount.findUniqueOrThrow({ where: { organizationId: m.org.id } });
    expect(row.bankAccountEnc).not.toContain('123456789012');

    const u = await makeOrgWithEvent(ctx.prisma);
    const unreg = await ctx.http().put(api(`/organizations/${u.org.id}/payout-account`)).set('Authorization', bearer(ctx, u.admin))
      .send({ ...REGISTERED, entityType: 'UNREGISTERED', registeredType: undefined, registrationNumber: undefined, orgPan: undefined, legalName: 'Galli Mandal (Ravi)' });
    expect(unreg.body).toMatchObject({ entityType: 'UNREGISTERED', orgPan: null, status: 'PENDING' });

    const v = bearer(ctx, await makeVolunteer(ctx.prisma, m.event.id));
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/payout-account`)).set('Authorization', v)).status).toBe(404);
  });

  it('online payments wait for verification; then settle gross = fee + commission + net; payouts recorded', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    await ctx.http().put(api(`/organizations/${m.org.id}/payout-account`)).set('Authorization', auth).send(REGISTERED);
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', auth).send({ publicBookingEnabled: true });
    const slot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', auth).send({ label: 'Day', startTime: '00:00', endTime: '23:59', price: 100 });
    const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const order = () => ctx.http().post(api('/public/booking/orders')).send({ eventId: m.event.id, timeSlotId: slot.body.id, date, visitorCount: 2, buyerName: 'Meena', buyerMobile: '9811111111' });
    expect((await order()).body.code).toBe('PAYOUTS_NOT_READY');

    expect((await ctx.http().post(api(`/platform/payout-accounts/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'REJECTED' })).status).toBe(400); // needs a note
    await ctx.http().post(api(`/platform/payout-accounts/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFIED' });
    await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ gatewayFeePercent: '2' });
    const o = await order();
    await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'success' });
    await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ gatewayFeePercent: '0' });

    const st = await ctx.http().get(api(`/organizations/${m.org.id}/settlements`)).set('Authorization', auth);
    // ₹200 gross: gateway 2% = ₹4, commission 1% of ₹100 × 2 = ₹2, mandal ₹194
    expect(st.body.items[0]).toMatchObject({ gross: '200.00', gatewayFee: '4.00', commission: '2.00', net: '194.00', status: 'PENDING_PAYOUT' });
    expect(st.body.totals.pendingPayout).toBe('194.00');

    const reveal = await ctx.http().post(api(`/platform/payout-accounts/${m.org.id}/reveal-bank`)).set('Authorization', sa);
    expect(reveal.body.bankAccount).toBe('123456789012');
    const p = await ctx.http().post(api('/platform/payouts')).set('Authorization', sa).send({ organizationId: m.org.id, reference: 'UTR123456' });
    expect(p.body).toMatchObject({ amount: '194.00', settlements: 1 });
    expect((await ctx.http().post(api('/platform/payouts')).set('Authorization', sa).send({ organizationId: m.org.id, reference: 'UTR999' })).status).toBe(400);
    const mine = await ctx.http().get(api(`/organizations/${m.org.id}/payouts`)).set('Authorization', auth);
    expect(mine.body.items[0]).toMatchObject({ amount: '194.00', reference: 'UTR123456' });
    // Changing the bank account sends it back to review and blocks paid orders again.
    await ctx.http().put(api(`/organizations/${m.org.id}/payout-account`)).set('Authorization', auth).send({ ...REGISTERED, bankAccount: '999988887777' });
    expect((await order()).body.code).toBe('PAYOUTS_NOT_READY');
  });

  it('donation receipts can be shared by secret link and emailed; 80G details appear for verified trusts', async () => {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    await ctx.http().put(api(`/organizations/${m.org.id}/payout-account`)).set('Authorization', auth).send(REGISTERED);
    await ctx.http().post(api(`/platform/payout-accounts/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFIED' });
    const d = await ctx.http().post(api(`/events/${m.event.id}/donations`)).set('Authorization', auth).send({ donorName: 'Sita', donorEmail: 'sita@test.dev', amount: '1001', method: 'UPI' });
    const share = await ctx.http().post(api(`/events/${m.event.id}/donations/${d.body.id}/share`)).set('Authorization', auth);
    expect(share.body.path).toMatch(/^\/r\//);
    const k = new URL(`http://x${share.body.path}`).searchParams.get('k');
    const pub = await ctx.http().get(api(`/public/receipts/${d.body.id}?k=${k}`));
    expect(pub.body).toMatchObject({ amount: '1001.00', issuer: { pan: 'AAATS1234Z', reg80G: '80G-123', legalName: 'Shree Ganesh Trust' } });
    expect((await ctx.http().get(api(`/public/receipts/${d.body.id}?k=wrongwrongwrongwrongwrong`))).status).toBe(404);
    const mail = ctx.app.get(MailService);
    expect((await ctx.http().post(api(`/events/${m.event.id}/donations/${d.body.id}/email-receipt`)).set('Authorization', auth)).body.sent).toBe(true);
    expect(mail.outbox.some((x) => x.to === 'sita@test.dev' && x.text.includes('/r/'))).toBe(true);
  });
});
