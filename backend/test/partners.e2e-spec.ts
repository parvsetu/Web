/** Promotional partners: brand signup, super-admin approval, per-pass wallet charging, caps, refunds, isolation. */
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx, verifyPayouts } from './helpers';

// 1×1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const HASH = bcrypt.hashSync('Password@123', 4);

describe('Promotional partners (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  let mail: MailService;
  const api = (p: string) => `/api/v1${p}`;
  const today = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;
  const dateCol = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

  beforeAll(async () => {
    ctx = await bootApp();
    mail = ctx.app.get(MailService);
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  /** A partner + its login, straight in the DB. */
  async function partner(opts: { status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; walletPaise?: number; name?: string } = {}) {
    const tag = randomBytes(4).toString('hex');
    const p = await ctx.prisma.partner.create({
      data: { name: opts.name ?? `Brand ${tag}`, contactName: 'Brand Manager', contactEmail: `${tag}@brand.dev`, contactPhone: '9000000000', status: opts.status ?? 'ACTIVE', walletBalancePaise: opts.walletPaise ?? 0 },
    });
    const user = await ctx.prisma.user.create({
      data: { name: `Brand user ${tag}`, mobile: `7${randomBytes(5).readUIntBE(0, 5).toString().padStart(9, '0').slice(0, 9)}`, email: `u${tag}@brand.dev`, passwordHash: HASH, partnerId: p.id },
    });
    return { partner: p, user, auth: bearer(ctx, user) };
  }

  async function campaign(partnerId: string, organizationId: string, opts: { ratePaise: number; maxPasses?: number; eventId?: string; status?: 'APPROVED' | 'REQUESTED' }) {
    return ctx.prisma.partnerCampaign.create({
      data: {
        partnerId, organizationId, eventId: opts.eventId ?? null, message: 'Festive offers inside!', startDate: dateCol(today()), endDate: dateCol(today()),
        ratePaise: opts.ratePaise, maxPasses: opts.maxPasses ?? null, status: opts.status ?? 'APPROVED', approvedAt: new Date(),
      },
    });
  }

  /** A mandal with ₹100 token price, 1% commission (₹1/person) and the given credit. */
  async function mandal(creditRupees = 1000) {
    const m = await makeOrgWithEvent(ctx.prisma);
    await ctx.prisma.orgBilling.update({ where: { organizationId: m.org.id }, data: { creditBalancePaise: creditRupees * 100, tokenPricePaise: 10000, commissionBps: 100, sponsorPassFeePaise: 150 } });
    return { ...m, auth: bearer(ctx, m.admin) };
  }
  const issue = (m: { event: { id: string }; auth: string }, body: object = {}) =>
    ctx.http().post(api(`/events/${m.event.id}/tokens`)).set('Authorization', m.auth).send({ durationHours: 3, ...body });
  const wallet = async (id: string) => (await ctx.prisma.partner.findUniqueOrThrow({ where: { id } })).walletBalancePaise;

  it('brand signup → email verification → super admin approval; PENDING can request but not be approved', async () => {
    const tag = Date.now().toString().slice(-8);
    const email = `brand${tag}@test.dev`;
    const mobile = `6${tag}1`.slice(0, 10);
    const res = await ctx.http().post(api('/partners/signup')).send({ brandName: 'Tanishq Jewellers', contactName: 'Riya', email, mobile, password: 'Secret@1234', gstin: '27aaact1234a1z5', websiteUrl: 'https://www.tanishq.co.in' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ verificationRequired: true, email });
    expect((await ctx.http().post(api('/partners/signup')).send({ brandName: 'Copycat', contactName: 'Someone', email: `other${tag}@test.dev`, mobile, password: 'Secret@1234' })).status).toBe(409);
    expect((await ctx.http().post(api('/auth/login')).send({ identifier: email, password: 'Secret@1234' })).body.code).toBe('EMAIL_NOT_VERIFIED');
    const code = mail.outbox.filter((m) => m.to === email).pop()!.text.match(/\b\d{6}\b/)![0];
    const verified = await ctx.http().post(api('/auth/verify-email')).send({ email, code });
    expect(verified.status).toBe(200);
    expect(verified.body.user).toMatchObject({ partner: { name: 'Tanishq Jewellers', status: 'PENDING' }, organizations: [], events: [] });
    const auth = `Bearer ${verified.body.accessToken}`;

    const me = await ctx.http().get(api('/partner/me')).set('Authorization', auth);
    expect(me.status).toBe(200);
    expect(me.body.partner).toMatchObject({ status: 'PENDING', gstin: '27AAACT1234A1Z5', walletBalance: '0.00' });
    const prof = await ctx.http().patch(api('/partner/me')).set('Authorization', auth).send({ tagline: 'Trust of the Tata', logoDataUrl: PNG });
    expect(prof.body.logoUrl).toMatch(/^\/public\/partners\//);
    expect((await ctx.http().get(api(prof.body.logoUrl.split('?')[0]))).headers['content-type']).toBe('image/png');

    // Request a campaign: the mandal's rate (₹1.50 here) is quoted.
    const m = await mandal();
    const browse = await ctx.http().get(api(`/partner/mandals?q=${encodeURIComponent(m.org.name)}`)).set('Authorization', auth);
    expect(browse.body.items[0]).toMatchObject({ id: m.org.id, ratePerPass: '1.50', events: [expect.objectContaining({ id: m.event.id })] });
    const reqd = await ctx.http().post(api('/partner/campaigns')).set('Authorization', auth)
      .send({ organizationId: m.org.id, eventId: m.event.id, message: 'Festive gold offers', startDate: today(), endDate: today(), maxPasses: 100 });
    expect(reqd.status).toBe(201);
    expect(reqd.body).toMatchObject({ status: 'REQUESTED', rate: '1.50', estimate: '150.00' });
    expect((await ctx.http().post(api('/partner/campaigns')).set('Authorization', auth)
      .send({ organizationId: m.org.id, message: 'Too early', startDate: '2020-01-01', endDate: today() })).status).toBe(400);

    // Campaign approval waits for the account; approving the account first, then the campaign at a new rate.
    const early = await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'APPROVE' });
    expect(early.body.code).toBe('PARTNER_NOT_ACTIVE');
    const list = await ctx.http().get(api('/platform/partners?status=PENDING&q=Tanishq')).set('Authorization', sa);
    const row = list.body.items.find((x: { id: string }) => x.id === me.body.partner.id);
    expect(row).toMatchObject({ login: { email, emailVerified: true }, campaigns: { REQUESTED: 1 } });
    expect((await ctx.http().post(api(`/platform/partners/${row.id}/status`)).set('Authorization', sa).send({ status: 'ACTIVE' })).body.status).toBe('ACTIVE');
    const ok = await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'APPROVE', rate: '2.00', note: 'Festival rate' });
    expect(ok.body).toMatchObject({ status: 'APPROVED', rate: '2.00', printing: 'WALLET_EMPTY' });
    // Rate is locked after approval.
    expect((await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'APPROVE', rate: '1.00' })).status).toBe(409);
    expect((await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'PAUSE', rate: '1.00' })).status).toBe(400);
    expect((await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'PAUSE' })).body.status).toBe('PAUSED');
    expect((await ctx.http().post(api(`/platform/partner-campaigns/${reqd.body.id}/review`)).set('Authorization', sa).send({ action: 'RESUME' })).body.status).toBe('APPROVED');

    // Demo recharge fills the wallet; the partner can cancel its own campaign.
    const r = await ctx.http().post(api('/partner/recharges')).set('Authorization', auth).send({ amount: '500' });
    expect((await ctx.http().post(api(`/partner/recharges/${r.body.id}/demo-pay`)).set('Authorization', auth).send({ outcome: 'success' })).body.status).toBe('PAID');
    expect((await ctx.http().get(api('/partner/me')).set('Authorization', auth)).body.partner).toMatchObject({ walletBalance: '500.00', totalRecharged: '500.00' });
    expect((await ctx.http().post(api(`/partner/campaigns/${reqd.body.id}/cancel`)).set('Authorization', auth)).body.status).toBe('CANCELLED');
    expect((await ctx.http().post(api(`/partner/campaigns/${reqd.body.id}/cancel`)).set('Authorization', auth)).status).toBe(409);
  });

  it('a desk pass prints the partner and charges ITS wallet; the mandal pays only commission; max 2 partners by rate', async () => {
    const m = await mandal(10);
    const a = await partner({ walletPaise: 1000, name: 'Alpha Gold' });
    const b = await partner({ walletPaise: 1000, name: 'Beta Sweets' });
    const c = await partner({ walletPaise: 1000, name: 'Gamma Cola' });
    await ctx.prisma.partner.update({ where: { id: a.partner.id }, data: { tagline: 'Pure gold', websiteUrl: 'https://alpha.example' } });
    const ca = await campaign(a.partner.id, m.org.id, { ratePaise: 200 });
    const cb = await campaign(b.partner.id, m.org.id, { ratePaise: 150, eventId: m.event.id });
    await campaign(c.partner.id, m.org.id, { ratePaise: 100 }); // lowest rate → not printed (2 per pass)
    await ctx.prisma.sponsor.create({ data: { organizationId: m.org.id, name: 'Local Sweets', showOnPasses: true } });

    const t = await issue(m, { visitorCount: 2, perPerson: true });
    expect(t.status).toBe(201);
    expect(t.body.tokens[0].sponsorIds).toHaveLength(1);
    expect(t.body.tokens[0].printedPartners.map((p: { name: string }) => p.name)).toEqual(['Alpha Gold', 'Beta Sweets']);
    expect(t.body.tokens[0].printedPartners[0]).toMatchObject({ message: 'Festive offers inside!', tagline: 'Pure gold', websiteUrl: 'https://alpha.example' });
    // 2 passes: Alpha 2 × ₹2, Beta 2 × ₹1.50; Gamma untouched; mandal: 2 × ₹1 commission only.
    expect(await wallet(a.partner.id)).toBe(600);
    expect(await wallet(b.partner.id)).toBe(700);
    expect(await wallet(c.partner.id)).toBe(1000);
    expect((await ctx.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId: m.org.id } })).creditBalancePaise).toBe(800);
    expect(await ctx.prisma.partnerCampaign.findUniqueOrThrow({ where: { id: ca.id } })).toMatchObject({ passesPrinted: 2, spentPaise: 400 });
    expect(await ctx.prisma.partnerCampaign.findUniqueOrThrow({ where: { id: cb.id } })).toMatchObject({ passesPrinted: 2, spentPaise: 300 });
    expect(await ctx.prisma.partnerWalletTransaction.findFirst({ where: { campaignId: ca.id, type: 'PASS_PRINT' } })).toMatchObject({ amountPaise: -400, balanceAfterPaise: 600, tokenCount: 2 });

    // A single token view carries them too; the partner sees the spend.
    const one = await issue(m);
    const view = await ctx.http().get(api(`/events/${m.event.id}/tokens/${one.body.id}`)).set('Authorization', m.auth);
    expect(view.body.printedPartners).toHaveLength(2);
    const over = await ctx.http().get(api('/partner/campaigns')).set('Authorization', a.auth);
    expect(over.body.items[0]).toMatchObject({ passesPrinted: 3, spent: '6.00', printing: 'LIVE' });
    const txs = await ctx.http().get(api('/partner/wallet/transactions')).set('Authorization', a.auth);
    expect(txs.body.items[0]).toMatchObject({ type: 'PASS_PRINT', amount: '-2.00', organization: { id: m.org.id } });

    // Platform earnings include partner money.
    const sum = await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa);
    expect(Number(sum.body.promotionalPartnerEarned)).toBeGreaterThanOrEqual(10.5);
  });

  it('a wallet that cannot cover the pass just skips the partner — the pass is still issued', async () => {
    const m = await mandal(10);
    const p = await partner({ walletPaise: 150 });
    await campaign(p.partner.id, m.org.id, { ratePaise: 200 });
    const t = await issue(m);
    expect(t.status).toBe(201);
    expect(t.body.printedPartners).toEqual([]);
    expect(t.body.partnerCampaignIds).toEqual([]);
    expect(await wallet(p.partner.id)).toBe(150);
    // A group of 2 per-person passes needs ₹4 — still skipped as a whole, never a partial print.
    await ctx.prisma.partner.update({ where: { id: p.partner.id }, data: { walletBalancePaise: 300 } });
    expect((await issue(m, { visitorCount: 2, perPerson: true })).body.tokens[0].printedPartners).toEqual([]);
    expect((await issue(m)).body.printedPartners).toHaveLength(1);
    expect(await wallet(p.partner.id)).toBe(100);
    const me = await ctx.http().get(api('/partner/me')).set('Authorization', p.auth);
    expect(me.body.wallet.state).toBe('EXHAUSTED');
  });

  it('maxPasses caps printing (and spend); paused, suspended or other-mandal campaigns never print', async () => {
    const m = await mandal(100);
    const p = await partner({ walletPaise: 10_000 });
    const c = await campaign(p.partner.id, m.org.id, { ratePaise: 100, maxPasses: 3 });
    expect((await issue(m, { visitorCount: 2, perPerson: true })).body.tokens[0].printedPartners).toHaveLength(1); // 2 of 3
    expect((await issue(m, { visitorCount: 2, perPerson: true })).body.tokens[0].printedPartners).toEqual([]); // 2 more would exceed
    expect((await issue(m)).body.printedPartners).toHaveLength(1); // 3 of 3
    expect((await issue(m)).body.printedPartners).toEqual([]);
    expect(await ctx.prisma.partnerCampaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ passesPrinted: 3, spentPaise: 300 });
    expect(await wallet(p.partner.id)).toBe(9_700);
    // Database backstop: the cap can't be exceeded directly either.
    await expect(ctx.prisma.partnerCampaign.update({ where: { id: c.id }, data: { passesPrinted: 4 } })).rejects.toThrow();
    await expect(ctx.prisma.partner.update({ where: { id: p.partner.id }, data: { walletBalancePaise: -1 } })).rejects.toThrow();

    const other = await mandal(100);
    const q = await partner({ walletPaise: 10_000 });
    const paused = await campaign(q.partner.id, m.org.id, { ratePaise: 500 });
    await ctx.prisma.partnerCampaign.update({ where: { id: paused.id }, data: { status: 'PAUSED' } });
    await campaign(q.partner.id, other.org.id, { ratePaise: 500, eventId: other.event.id });
    expect((await issue(m)).body.printedPartners).toEqual([]);
    expect(await wallet(q.partner.id)).toBe(10_000);
    // Suspending the partner stops the other campaign too, and locks writes (reads still work).
    expect((await issue(other)).body.printedPartners).toHaveLength(1);
    await ctx.http().post(api(`/platform/partners/${q.partner.id}/status`)).set('Authorization', sa).send({ status: 'SUSPENDED', note: 'Unpaid invoice' });
    expect((await issue(other)).body.printedPartners).toEqual([]);
    expect((await ctx.http().patch(api('/partner/me')).set('Authorization', q.auth).send({ tagline: 'x' })).body.code).toBe('PARTNER_LOCKED');
    expect((await ctx.http().get(api('/partner/campaigns')).set('Authorization', q.auth)).status).toBe(200);
  });

  it('10 simultaneous passes with wallet for exactly 5 → exactly 5 charged, balance 0, never negative', async () => {
    const m = await mandal(1000);
    const p = await partner({ walletPaise: 5 * 120 });
    const c = await campaign(p.partner.id, m.org.id, { ratePaise: 120 });
    const res = await Promise.all(Array.from({ length: 10 }, () => issue(m)));
    expect(res.every((r) => r.status === 201)).toBe(true);
    expect(res.filter((r) => r.body.printedPartners.length === 1)).toHaveLength(5);
    expect(await wallet(p.partner.id)).toBe(0);
    expect(await ctx.prisma.partnerWalletTransaction.count({ where: { partnerId: p.partner.id, type: 'PASS_PRINT' } })).toBe(5);
    expect(await ctx.prisma.partnerCampaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ passesPrinted: 5, spentPaise: 600 });
    expect(await ctx.prisma.token.count({ where: { eventId: m.event.id, partnerCampaignIds: { has: c.id } } })).toBe(5);

    // Same wallet shared by two mandals (two brands each, opposite rate order): no deadlock, no overdraw.
    const [m1, m2] = [await mandal(1000), await mandal(1000)];
    const x = await partner({ walletPaise: 500 });
    const y = await partner({ walletPaise: 10_000 });
    await campaign(x.partner.id, m1.org.id, { ratePaise: 100 });
    await campaign(y.partner.id, m1.org.id, { ratePaise: 50 });
    await campaign(x.partner.id, m2.org.id, { ratePaise: 100 });
    await campaign(y.partner.id, m2.org.id, { ratePaise: 200 });
    const mixed = await Promise.all(Array.from({ length: 12 }, (_, i) => issue(i % 2 ? m1 : m2)));
    expect(mixed.every((r) => r.status === 201)).toBe(true);
    expect(await wallet(x.partner.id)).toBe(0);
    expect(await ctx.prisma.partnerWalletTransaction.count({ where: { partnerId: x.partner.id, type: 'PASS_PRINT' } })).toBe(5);
    expect(await wallet(y.partner.id)).toBe(10_000 - 6 * 50 - 6 * 200);
  });

  it('an online order holds the partner charge; a failed payment refunds it exactly once; a paid one prints', async () => {
    const m = await mandal(1000);
    await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ publicBookingEnabled: true });
    const slot = await ctx.http().post(api(`/events/${m.event.id}/time-slots`)).set('Authorization', m.auth).send({ label: 'All day', startTime: '00:00', endTime: '23:59', price: 50 });
    const p = await partner({ walletPaise: 1000 });
    const c = await campaign(p.partner.id, m.org.id, { ratePaise: 100 });
    const order = () => ctx.http().post(api('/public/booking/orders'))
      .send({ eventId: m.event.id, timeSlotId: slot.body.id, date: today(), visitorCount: 2, perPersonPasses: true, buyerName: 'Asha', buyerMobile: '9833333333' });

    const o = await order();
    expect(o.status).toBe(201);
    expect(await wallet(p.partner.id)).toBe(800); // held for 2 passes
    const fail = await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'fail' });
    expect(fail.body.status).toBe('FAILED');
    expect(await wallet(p.partner.id)).toBe(1000);
    // Replays (another fail, the expiry sweeper) never refund twice.
    await ctx.http().post(api(`/public/booking/orders/${o.body.id}/demo-pay`)).send({ k: o.body.accessKey, outcome: 'fail' });
    await ctx.app.get((await import('../src/modules/passes/passes.service')).PassesService).closeOrder(o.body.id, 'EXPIRED');
    expect(await wallet(p.partner.id)).toBe(1000);
    expect(await ctx.prisma.partnerWalletTransaction.count({ where: { passOrderId: o.body.id, type: 'REFUND' } })).toBe(1);
    expect(await ctx.prisma.partnerCampaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ passesPrinted: 0, spentPaise: 0 });

    const o2 = await order();
    const paid = await ctx.http().post(api(`/public/booking/orders/${o2.body.id}/demo-pay`)).send({ k: o2.body.accessKey, outcome: 'success' });
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.passes).toHaveLength(2);
    expect(paid.body.printedPartners).toEqual([expect.objectContaining({ id: c.id, name: p.partner.name, message: 'Festive offers inside!' })]);
    expect(await wallet(p.partner.id)).toBe(800);
  });

  it('partner accounts see no mandal; mandal users and partners are kept out of each other\'s areas', async () => {
    const m = await mandal();
    const p = await partner({ walletPaise: 0 });
    expect((await ctx.http().get(api(`/organizations/${m.org.id}`)).set('Authorization', p.auth)).status).toBe(404);
    expect((await ctx.http().get(api(`/events/${m.event.id}`)).set('Authorization', p.auth)).status).toBe(404);
    expect((await issue({ event: m.event, auth: p.auth })).status).toBe(404);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/billing`)).set('Authorization', p.auth)).status).toBe(404);
    expect((await ctx.http().get(api('/organizations')).set('Authorization', p.auth)).body.items).toHaveLength(0);
    expect((await ctx.http().get(api('/platform/partners')).set('Authorization', p.auth)).status).toBe(403);
    expect((await ctx.http().post(api('/volunteer-applications')).set('Authorization', p.auth).send({ organizationId: m.org.id })).status).toBe(403);

    // A mandal admin is not a partner, and can't touch the platform's partner admin.
    const me = await ctx.http().get(api('/partner/me')).set('Authorization', m.auth);
    expect(me.status).toBe(403);
    expect(me.body.code).toBe('NOT_A_PARTNER');
    expect((await ctx.http().get(api('/platform/partners')).set('Authorization', m.auth)).status).toBe(403);
    const camp = await campaign(p.partner.id, m.org.id, { ratePaise: 100, status: 'REQUESTED' });
    expect((await ctx.http().post(api(`/platform/partner-campaigns/${camp.id}/review`)).set('Authorization', m.auth).send({ action: 'APPROVE' })).status).toBe(403);
    expect((await ctx.http().post(api(`/platform/partners/${p.partner.id}/adjust`)).set('Authorization', m.auth).send({ amount: '100', reason: 'nope' })).status).toBe(403);
    // Another partner can't cancel someone else's campaign.
    const other = await partner();
    expect((await ctx.http().post(api(`/partner/campaigns/${camp.id}/cancel`)).set('Authorization', other.auth)).status).toBe(404);
  });

  it('pass print format is set by the super admin per mandal; AUTO = A4 with 2+ ads, else thermal 80 mm', async () => {
    const m = await mandal(100);
    // Default AUTO, no ads → thermal.
    expect((await issue(m)).body.printFormat).toBe('THERMAL_80');
    // One mandal sponsor + one platform partner = 2 ads → A4 (PDF-friendly page).
    await ctx.prisma.sponsor.create({ data: { organizationId: m.org.id, name: 'Local Sweets', showOnPasses: true } });
    expect((await issue(m)).body.printFormat).toBe('THERMAL_80'); // 1 ad
    const p = await partner({ walletPaise: 10_000 });
    await campaign(p.partner.id, m.org.id, { ratePaise: 100 });
    const two = await issue(m, { visitorCount: 2, perPerson: true });
    expect(two.body.tokens[0]).toMatchObject({ printFormat: 'A4' });
    expect((await ctx.http().get(api(`/events/${m.event.id}/tokens/${two.body.tokens[1].id}`)).set('Authorization', m.auth)).body.printFormat).toBe('A4');

    // The mandal can't choose: its PATCH is ignored and it can't reach the platform override.
    await ctx.http().patch(api(`/events/${m.event.id}`)).set('Authorization', m.auth).send({ passPrintFormat: 'THERMAL_58' });
    expect((await ctx.http().get(api(`/events/${m.event.id}`)).set('Authorization', m.auth)).body.passPrintFormat).toBe('AUTO');
    expect((await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', m.auth).send({ passPrintFormat: 'A4' })).status).toBe(403);

    // The super admin fixes it for this mandal; null resets to the platform default.
    const set = await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', sa).send({ passPrintFormat: 'THERMAL_58' });
    expect(set.body).toMatchObject({ passPrintFormat: 'THERMAL_58', overrides: { passPrintFormat: true } });
    expect((await issue(m)).body.printFormat).toBe('THERMAL_58');
    expect((await ctx.http().get(api(`/events/${m.event.id}`)).set('Authorization', m.auth)).body.passPrintFormat).toBe('THERMAL_58');
    expect((await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', sa).send({ passPrintFormat: 'POSTER' })).status).toBe(400);
    await ctx.http().patch(api(`/platform/billing/mandals/${m.org.id}`)).set('Authorization', sa).send({ passPrintFormat: null });
    expect((await issue(m)).body.printFormat).toBe('A4');
    const settings = await ctx.http().get(api('/platform/billing/settings')).set('Authorization', sa);
    expect(settings.body.defaultPassPrintFormat).toBe('AUTO');
  });

  it('super admin wallet adjustments are audited and can never overdraw', async () => {
    const p = await partner({ walletPaise: 500 });
    const up = await ctx.http().post(api(`/platform/partners/${p.partner.id}/adjust`)).set('Authorization', sa).send({ amount: '20', reason: 'Offline NEFT' });
    expect(up.body.walletBalance).toBe('25.00');
    expect((await ctx.http().post(api(`/platform/partners/${p.partner.id}/adjust`)).set('Authorization', sa).send({ amount: '-30', reason: 'Oops' })).status).toBe(400);
    expect(await ctx.prisma.auditLog.count({ where: { entityId: p.partner.id, action: 'partner.wallet_adjusted' } })).toBe(1);
    const txs = await ctx.http().get(api(`/platform/partners/${p.partner.id}/transactions`)).set('Authorization', sa);
    expect(txs.body.items[0]).toMatchObject({ type: 'ADJUSTMENT', amount: '20.00', balanceAfter: '25.00', note: 'Offline NEFT' });
    const queue = await ctx.http().get(api('/platform/partner-campaigns?status=REQUESTED')).set('Authorization', sa);
    expect(queue.status).toBe(200);
    expect((await ctx.http().post(api(`/platform/partners/${p.partner.id}/status`)).set('Authorization', sa).send({ status: 'REJECTED' })).status).toBe(400); // note required
  });
});
