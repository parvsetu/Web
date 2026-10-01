/** Donations (provider abstraction, receipts, webhook) and expenses. */
import { createHmac } from 'crypto';
import { DateTime } from 'luxon';
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx } from './helpers';

describe('Donations & expenses (e2e)', () => {
  let ctx: TestCtx;
  let event: { id: string };
  let auth: string;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
    const made = await makeOrgWithEvent(ctx.prisma, { prefix: 'FIN' });
    event = made.event;
    auth = bearer(ctx, made.admin);
  });
  afterAll(() => ctx.app.close());

  it('a manual (cash) donation is confirmed immediately with a sequential receipt', async () => {
    const a = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send({ donorName: 'Ravi', amount: 1500, method: 'CASH' });
    const b = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send({ donorName: 'Sita', amount: '2100.5', method: 'UPI', paymentReference: 'UPI123' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ paymentStatus: 'SUCCESS', paymentProvider: 'manual', receiptNo: expect.stringMatching(/^FIN-R-\d{4}-00001$/) });
    expect(b.body.receiptNo).toMatch(/-00002$/);
    const receipt = await ctx.http().get(api(`/events/${event.id}/donations/${b.body.id}/receipt`)).set('Authorization', auth);
    expect(receipt.body).toMatchObject({ amount: '2100.50', amountInWords: 'Two Thousand One Hundred Rupees and Fifty Paise Only' });
  });

  it('rejects zero/negative/over-precise amounts', async () => {
    for (const amount of [0, -5, '10.555', 'abc']) {
      const res = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send({ donorName: 'X', amount, method: 'CASH' });
      expect(res.status).toBe(400);
    }
  });

  it('an online donation stays PENDING until a correctly signed provider webhook confirms it', async () => {
    const res = await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth)
      .send({ donorName: 'Online donor', amount: '501', method: 'ONLINE', provider: 'mock' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ paymentStatus: 'PENDING', receiptNo: null, payment: { provider: 'mock' } });
    const orderId = res.body.payment.providerOrderId;
    expect((await ctx.http().get(api(`/events/${event.id}/donations/${res.body.id}/receipt`)).set('Authorization', auth)).status).toBe(409);

    const body = JSON.stringify({ orderId, status: 'paid', paymentId: 'pay_1' });
    const forged = await ctx.http().post(api('/payments/webhooks/mock')).set('Content-Type', 'application/json').set('x-mock-signature', 'deadbeef').send(body);
    expect(forged.status).toBe(401);
    const sig = createHmac('sha256', process.env.PAYMENTS_MOCK_SECRET!).update(body).digest('hex');
    const ok = await ctx.http().post(api('/payments/webhooks/mock')).set('Content-Type', 'application/json').set('x-mock-signature', sig).send(body);
    expect(ok.status).toBe(200);
    const after = await ctx.http().get(api(`/events/${event.id}/donations/${res.body.id}`)).set('Authorization', auth);
    expect(after.body).toMatchObject({ paymentStatus: 'SUCCESS', paymentReference: 'pay_1', receiptNo: expect.any(String) });
    // Replaying the webhook doesn't assign a second receipt.
    await ctx.http().post(api('/payments/webhooks/mock')).set('Content-Type', 'application/json').set('x-mock-signature', sig).send(body);
    const again = await ctx.http().get(api(`/events/${event.id}/donations/${res.body.id}`)).set('Authorization', auth);
    expect(again.body.receiptNo).toBe(after.body.receiptNo);
  });

  it('finance report: donations − expenses = balance; volunteers cannot see any of it', async () => {
    const date = DateTime.now().setZone('Asia/Kolkata').toISODate();
    await ctx.http().post(api(`/events/${event.id}/expenses`)).set('Authorization', auth).send({ category: 'Decoration', description: 'Lights', amount: '1000', expenseDate: date, vendor: 'Bright' });
    const fin = await ctx.http().get(api(`/events/${event.id}/reports/finance`)).set('Authorization', auth);
    expect(fin.body.donations.total).toBe('4101.50');
    expect(fin.body.expenses.total).toBe('1000.00');
    expect(fin.body.balance).toBe('3101.50');

    const gate = await makeVolunteer(ctx.prisma, event.id);
    const g = bearer(ctx, gate);
    expect((await ctx.http().get(api(`/events/${event.id}/donations`)).set('Authorization', g)).status).toBe(403);
    expect((await ctx.http().get(api(`/events/${event.id}/expenses`)).set('Authorization', g)).status).toBe(403);
    expect((await ctx.http().get(api(`/events/${event.id}/reports/finance`)).set('Authorization', g)).status).toBe(403);
  });

  it('expense edits are audited with before/after', async () => {
    const date = DateTime.now().setZone('Asia/Kolkata').toISODate();
    const e = await ctx.http().post(api(`/events/${event.id}/expenses`)).set('Authorization', auth).send({ category: 'Bhog', description: 'Prasad', amount: '300', expenseDate: date });
    const upd = await ctx.http().patch(api(`/events/${event.id}/expenses/${e.body.id}`)).set('Authorization', auth).send({ amount: '350', reason: 'Bill corrected' });
    expect(upd.body.amount).toBe('350.00');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityId: e.body.id, action: 'expense.updated' } });
    expect(log.reason).toBe('Bill corrected');
    expect((log.before as { amount: string }).amount).toBe('300.00');
  });
});
