/** Anonymous donations (gupt daan): no stored name, receipts say so, never 80G, one-way anonymize. */
import { bearer, bootApp, makeOrgWithEvent, TestCtx, verifyPayouts } from './helpers';

describe('Anonymous donations (e2e)', () => {
  let ctx: TestCtx;
  let event: { id: string };
  let auth: string;
  const api = (p: string) => `/api/v1${p}`;
  const donate = (body: Record<string, unknown>) => ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send(body);

  beforeAll(async () => {
    ctx = await bootApp();
    const made = await makeOrgWithEvent(ctx.prisma, { prefix: 'ANO' });
    event = made.event;
    auth = bearer(ctx, made.admin);
    await verifyPayouts(ctx.prisma, made.org.id, made.admin.id);
    await ctx.prisma.payoutAccount.update({ where: { organizationId: made.org.id }, data: { reg80G: 'AAATS1234AF20214' } });
  });
  afterAll(() => ctx.app.close());

  it('a named donation still needs the name', async () => {
    const r = await donate({ amount: 500, method: 'CASH' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('DONOR_NAME_REQUIRED');
  });

  it('stores no name even if one is sent, and the receipt is anonymous and not 80G-eligible', async () => {
    const r = await donate({ isAnonymous: true, donorName: 'Should Vanish', donorEmail: 'g@daan.dev', amount: 1100, method: 'UPI' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ isAnonymous: true, donorName: null, donorEmail: 'g@daan.dev', paymentStatus: 'SUCCESS' });
    const row = await ctx.prisma.donation.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(row.donorName).toBeNull();
    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: r.body.id } });
    expect(JSON.stringify(audit)).not.toContain('Should Vanish');

    const receipt = await ctx.http().get(api(`/events/${event.id}/donations/${r.body.id}/receipt`)).set('Authorization', auth);
    expect(receipt.body).toMatchObject({ isAnonymous: true, donorName: null, eligibleFor80G: false });
    const share = await ctx.http().post(api(`/events/${event.id}/donations/${r.body.id}/share`)).set('Authorization', auth);
    const pub = await ctx.http().get(api(`/public/receipts/${r.body.id}?k=${share.body.path.split('k=')[1]}`));
    expect(pub.body).toMatchObject({ donorName: null, isAnonymous: true });
    expect((await ctx.http().post(api(`/events/${event.id}/donations/${r.body.id}/email-receipt`)).set('Authorization', auth)).status).toBe(200);

    const named = await donate({ donorName: 'Ravi', amount: 100, method: 'CASH' });
    // An 80G number on the payout account alone no longer makes a receipt claim 80G — that needs a verified
    // 80G profile and the donor's PAN / ID (see tax.e2e-spec.ts).
    expect((await ctx.http().get(api(`/events/${event.id}/donations/${named.body.id}/receipt`)).set('Authorization', auth)).body.eligibleFor80G).toBe(false);
    // The database itself refuses a half-anonymous row.
    await expect(ctx.prisma.donation.update({ where: { id: named.body.id }, data: { isAnonymous: true } })).rejects.toThrow();
  });

  it('anonymous donation with passes: the passes carry no name', async () => {
    await ctx.http().patch(api(`/events/${event.id}`)).set('Authorization', auth).send({ publicBookingEnabled: true });
    const now = new Date();
    const r = await donate({
      isAnonymous: true, amount: 2100, method: 'CASH',
      passes: { validFrom: new Date(now.getTime() - 60_000).toISOString(), validUntil: new Date(now.getTime() + 3_600_000).toISOString(), visitorCount: 1 },
    });
    expect(r.status).toBe(201);
    const tokens = await ctx.prisma.token.findMany({ where: { donationId: r.body.id }, include: { visitor: true } });
    expect(tokens.length).toBe(1);
    expect(tokens[0].visitor?.name ?? null).toBeNull();
  });

  it('makeAnonymous erases the name (and on the donor’s passes), one way, unaudited name', async () => {
    const now = new Date();
    const r = await donate({
      donorName: 'Kamala Devi', amount: 5100, method: 'CASH',
      passes: { validFrom: new Date(now.getTime() - 60_000).toISOString(), validUntil: new Date(now.getTime() + 3_600_000).toISOString(), visitorCount: 1 },
    });
    expect(r.status).toBe(201);
    const up = await ctx.http().patch(api(`/events/${event.id}/donations/${r.body.id}`)).set('Authorization', auth).send({ makeAnonymous: true, reason: 'Donor asked for gupt daan' });
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ isAnonymous: true, donorName: null });
    const tokens = await ctx.prisma.token.findMany({ where: { donationId: r.body.id }, include: { visitor: true } });
    expect(tokens[0].visitor?.name ?? null).toBeNull();
    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: r.body.id, action: 'donation.updated' } });
    expect(JSON.stringify(audit)).not.toContain('Kamala');
    // Can't be un-anonymized: the field only accepts true.
    expect((await ctx.http().patch(api(`/events/${event.id}/donations/${r.body.id}`)).set('Authorization', auth).send({ makeAnonymous: false })).status).toBe(400);
    // Search by the old name finds nothing.
    const list = await ctx.http().get(api(`/events/${event.id}/donations?q=Kamala`)).set('Authorization', auth);
    expect(list.body.total).toBe(0);
  });
});
