/** Public donations: a visitor gives on the festival page (no login), pays online (demo gateway), gets the receipt; 80G, payouts, expiry, isolation. */
import { bearer, bootApp, makeOrgWithEvent, TestCtx, verifyPayouts } from './helpers';

describe('Public donations (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  async function setup(opts: { enabled?: boolean; payouts?: boolean; tax80G?: boolean } = {}) {
    const m = await makeOrgWithEvent(ctx.prisma);
    if (opts.enabled !== false) await ctx.prisma.event.update({ where: { id: m.event.id }, data: { publicDonationsEnabled: true } });
    if (opts.payouts !== false) await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    if (opts.tax80G) {
      await ctx.prisma.orgTaxProfile.create({
        data: {
          organizationId: m.org.id, urn: 'AAATS1234AF20214', urnIssuedOn: new Date('2024-04-01'), validFrom: new Date('2024-04-01'),
          orgPanEnc: 'x', orgPanLast4: '234F', status: 'VERIFIED', deductionPercent: 50,
        },
      });
    }
    return { ...m, auth: bearer(ctx, m.admin) };
  }

  const donate = (body: Record<string, unknown>) => ctx.http().post(api('/public/donations')).send(body);
  const pay = (id: string, k: string, outcome = 'success') => ctx.http().post(api(`/public/donations/${id}/demo-pay`)).send({ k, outcome });

  it('is off unless the mandal enables it', async () => {
    const s = await setup({ enabled: false });
    expect((await ctx.http().get(api(`/public/donations/events/${s.event.id}`))).status).toBe(404);
    const r = await donate({ eventId: s.event.id, donorName: 'Asha Patil', amount: '501' });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('DONATIONS_CLOSED');
    const pub = await ctx.http().get(api(`/public/events/${s.event.id}`));
    expect(pub.body.publicDonationsEnabled).toBe(false);
  });

  it('a named donation: pending → paid → receipt number, public receipt, settlement, admin list', async () => {
    const s = await setup();
    const info = await ctx.http().get(api(`/public/donations/events/${s.event.id}`));
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ onlinePayments: true, deduction80G: null });

    const r = await donate({ eventId: s.event.id, donorName: 'Asha Patil', donorMobile: '9876543210', amount: '501' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'PENDING', amount: '501.00', receiptNo: null, receiptPath: null, payment: { provider: 'demo', demo: true } });
    const k = r.body.accessKey as string;

    // Wrong key = not found; unpaid = no public receipt yet.
    expect((await ctx.http().get(api(`/public/donations/${r.body.id}?k=${'x'.repeat(24)}`))).status).toBe(404);
    expect((await ctx.http().get(api(`/public/receipts/${r.body.id}?k=${k}`))).status).toBe(409);

    const p = await pay(r.body.id, k);
    expect(p.status).toBe(200);
    expect(p.body.status).toBe('SUCCESS');
    expect(p.body.receiptNo).toMatch(/-R-\d{4}-00001$/);
    expect(p.body.receiptPath).toBe(`/r/${r.body.id}?k=${k}`);

    // Replay is harmless: same receipt, one settlement.
    expect((await pay(r.body.id, k)).body.receiptNo).toBe(p.body.receiptNo);
    const settlements = await ctx.prisma.paymentSettlement.findMany({ where: { sourceType: 'DONATION', sourceId: r.body.id } });
    expect(settlements).toHaveLength(1);
    expect(settlements[0]).toMatchObject({ grossPaise: 50100, commissionPaise: 0 });

    const receipt = await ctx.http().get(api(`/public/receipts/${r.body.id}?k=${k}`));
    expect(receipt.body).toMatchObject({ donorName: 'Asha Patil', method: 'ONLINE', amount: '501.00' });

    const list = await ctx.http().get(api(`/events/${s.event.id}/donations`)).set('Authorization', s.auth);
    expect(list.body.items[0]).toMatchObject({ id: r.body.id, paymentStatus: 'SUCCESS', method: 'ONLINE', paymentProvider: 'demo', createdBy: null });
    expect(list.body.totalReceived).toBe('501.00');
  });

  it('anonymous: no name stored, PAN refused; failed payment gets no receipt and cannot be paid after', async () => {
    const s = await setup();
    const bad = await donate({ eventId: s.event.id, isAnonymous: true, amount: '1100', taxId: { idType: 'PAN', idNumber: 'ABCDE1234F' } });
    expect(bad.body.code).toBe('ANONYMOUS_NO_TAX_ID');

    const r = await donate({ eventId: s.event.id, isAnonymous: true, donorName: 'Should Vanish', amount: '1100' });
    expect(r.body).toMatchObject({ isAnonymous: true, donorName: null });
    expect((await ctx.prisma.donation.findUniqueOrThrow({ where: { id: r.body.id } })).donorName).toBeNull();

    const f = await pay(r.body.id, r.body.accessKey, 'fail');
    expect(f.body).toMatchObject({ status: 'FAILED', receiptNo: null });
    const again = await pay(r.body.id, r.body.accessKey);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DONATION_CLOSED');
  });

  it('80G: a named online donation with PAN is eligible when the mandal is verified', async () => {
    const s = await setup({ tax80G: true });
    expect((await ctx.http().get(api(`/public/donations/events/${s.event.id}`))).body.deduction80G).toBe(50);
    const r = await donate({ eventId: s.event.id, donorName: 'Ravi Kulkarni', amount: '5100', taxId: { idType: 'PAN', idNumber: 'ABCDE1234F', address: 'Pune' } });
    expect(r.status).toBe(201);
    await pay(r.body.id, r.body.accessKey);
    const receipt = await ctx.http().get(api(`/public/receipts/${r.body.id}?k=${r.body.accessKey}`));
    expect(receipt.body).toMatchObject({ eligibleFor80G: true, tax80G: { deductionPercent: 50 } });
  });

  it('refuses without verified payouts, and amounts out of range', async () => {
    const s = await setup({ payouts: false });
    expect((await ctx.http().get(api(`/public/donations/events/${s.event.id}`))).body.onlinePayments).toBe(false);
    expect((await donate({ eventId: s.event.id, donorName: 'Asha', amount: '501' })).body.code).toBe('PAYOUTS_NOT_READY');
    const ok = await setup();
    expect((await donate({ eventId: ok.event.id, donorName: 'Asha', amount: '5' })).body.code).toBe('AMOUNT_OUT_OF_RANGE');
    expect((await donate({ eventId: ok.event.id, amount: '501' })).body.code).toBe('DONOR_NAME_REQUIRED');
  });

  it('an abandoned checkout expires and cannot be paid', async () => {
    const s = await setup();
    const r = await donate({ eventId: s.event.id, donorName: 'Late Payer', amount: '251' });
    await ctx.prisma.donation.update({ where: { id: r.body.id }, data: { createdAt: new Date(Date.now() - 31 * 60_000) } });
    const p = await pay(r.body.id, r.body.accessKey);
    expect(p.status).toBe(409);
    expect(p.body.code).toBe('DONATION_EXPIRED');
    expect((await ctx.http().get(api(`/public/donations/${r.body.id}?k=${r.body.accessKey}`))).body.status).toBe('FAILED');
  });
});
