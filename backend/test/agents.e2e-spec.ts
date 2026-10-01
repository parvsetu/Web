/** Field agents: accounts, isolation, agent-filed registrations, referral earnings (idempotent), payouts. */
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Field agents & referrals (e2e)', () => {
  let ctx: TestCtx;
  let mail: MailService;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  let n = 0;
  const fresh = () => {
    n++;
    return { email: `agt${Date.now()}${n}@test.dev`, mobile: `4${String(Date.now()).slice(-7)}${String(n).padStart(2, '0')}` };
  };
  const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const codeFor = (to: string) => mail.outbox.filter((m) => m.to === to).pop()?.text.match(/\b\d{6}\b/)?.[0];

  beforeAll(async () => {
    ctx = await bootApp();
    mail = ctx.app.get(MailService);
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  async function createAgent(extra: Record<string, unknown> = {}) {
    const { email, mobile } = fresh();
    const res = await ctx.http().post(api('/platform/agents')).set('Authorization', sa).send({ name: 'Rakesh Kulkarni', phone: mobile, email, referralFee: '300', commissionPercent: '10', ...extra });
    expect(res.status).toBe(201);
    const login = await ctx.http().post(api('/auth/login')).send({ identifier: mobile, password: res.body.temporaryPassword });
    expect(login.status).toBe(200);
    return { agent: res.body.agent, auth: `Bearer ${login.body.accessToken}`, email, mobile, me: login.body.user };
  }

  const events2 = () => [
    { festivalType: 'GANESH_UTSAV', name: 'Ganeshotsav', startDate: future(5), endDate: future(9) },
    { festivalType: 'NAVRATRI', name: 'Navratri Garba', startDate: future(20), endDate: future(28) },
  ];

  /** Self-registration with the agent's referral code, verified + approved; returns the two pay tokens. */
  async function referredMandal(code: string, fees: [string, string] = ['1000', '2000']) {
    const { email, mobile } = fresh();
    const reg = await ctx.http().post(api('/public/mandal-registrations')).send({
      orgName: `Referred Mandal ${n}`, city: 'Nagpur', state: 'Maharashtra', contactName: 'Sunil', mobile, email, password: 'Secret@1234',
      referralCode: code.toLowerCase(), declarationAccepted: true, events: events2(),
    });
    expect(reg.status).toBe(201);
    await ctx.http().post(api('/auth/verify-email')).send({ email, code: codeFor(email) });
    const ap = await ctx.http().post(api(`/platform/mandal-registrations/${reg.body.registrationId}/approve`)).set('Authorization', sa)
      .send({ events: [{ index: 0, fee: fees[0] }, { index: 1, fee: fees[1] }] });
    expect(ap.body.agent).toMatchObject({ code });
    const tokens = ap.body.events.map((e: { payment: { payUrl: string } }) => e.payment.payUrl.split('/pay/event-fee/')[1]) as string[];
    return { orgId: ap.body.organization.id as string, events: ap.body.events as { id: string }[], tokens };
  }
  const pay = (token: string) => ctx.http().post(api(`/public/event-fee/${token}/demo-pay`)).send({ outcome: 'success' });
  const agentMe = async (auth: string) => (await ctx.http().get(api('/agent/me')).set('Authorization', auth)).body;

  it('super admin creates an agent: temporary password emailed, login lands on the agent dashboard data', async () => {
    const { agent, auth, email, me } = await createAgent({ code: 'rakesh7x' });
    expect(agent).toMatchObject({ code: 'RAKESH7X', status: 'ACTIVE', referralLink: expect.stringContaining('/register?ref=RAKESH7X') });
    expect(mail.outbox.some((m) => m.to === email && /agent account/.test(m.subject))).toBe(true);
    expect(me.agent).toMatchObject({ code: 'RAKESH7X', status: 'ACTIVE' });
    const o = await agentMe(auth);
    expect(o).toMatchObject({ rates: { referralFee: '300.00', commissionPercent: '10.00' }, earnings: { earned: '0.00', paid: '0.00', due: '0.00' }, stats: { registered: 0 } });
    expect((await ctx.http().post(api('/platform/agents')).set('Authorization', sa).send({ name: 'Dup', phone: fresh().mobile, email: fresh().email, code: 'RAKESH7X' })).body.code).toBe('CODE_TAKEN');
    expect((await ctx.http().get(api('/public/referral/rakesh7x'))).body).toEqual({ valid: true, code: 'RAKESH7X', agentName: 'Rakesh' });
  });

  it('agents are denied on org / event / platform / partner routes; mandal and partner users on /agent', async () => {
    const { auth } = await createAgent();
    const m = await makeOrgWithEvent(ctx.prisma);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}`)).set('Authorization', auth)).status).toBe(404);
    expect((await ctx.http().get(api(`/events/${m.event.id}`)).set('Authorization', auth)).status).toBe(404);
    expect((await ctx.http().get(api(`/events/${m.event.id}/tokens`)).set('Authorization', auth)).status).toBe(404);
    expect((await ctx.http().get(api('/platform/agents')).set('Authorization', auth)).status).toBe(403);
    expect((await ctx.http().get(api('/platform/mandal-registrations')).set('Authorization', auth)).status).toBe(403);
    expect((await ctx.http().get(api('/partner/me')).set('Authorization', auth)).status).toBe(403);
    expect((await ctx.http().post(api('/volunteer-applications')).set('Authorization', auth).send({ organizationId: m.org.id })).status).toBe(403);
    expect((await ctx.http().get(api('/events')).set('Authorization', auth)).body).toEqual([]);

    const mandalAdmin = bearer(ctx, m.admin);
    expect((await ctx.http().get(api('/agent/me')).set('Authorization', mandalAdmin)).body.code).toBe('NOT_AN_AGENT');
    expect((await ctx.http().post(api('/agent/mandal-registrations')).set('Authorization', mandalAdmin).send({})).status).toBe(403);
    const partner = await ctx.prisma.partner.create({ data: { name: 'Brand', contactName: 'B', contactEmail: `${fresh().email}`, contactPhone: '9000000099', status: 'ACTIVE' } });
    const pUser = await makeUser(ctx.prisma);
    await ctx.prisma.user.update({ where: { id: pUser.id }, data: { partnerId: partner.id } });
    expect((await ctx.http().get(api('/agent/me')).set('Authorization', bearer(ctx, pUser))).status).toBe(403);
    expect((await ctx.http().get(api('/agent/me')).set('Authorization', sa)).status).toBe(403);
  });

  it('an agent files a registration on the mandal\'s behalf; the contact sets a password via the emailed link', async () => {
    const { agent, auth } = await createAgent();
    const { email, mobile } = fresh();
    const noDecl = await ctx.http().post(api('/agent/mandal-registrations')).set('Authorization', auth)
      .send({ orgName: 'Shiv Shakti Mitra Mandal', city: 'Nagpur', contactName: 'Vikas', mobile, email, events: events2() });
    expect(noDecl.body.code).toBe('DECLARATION_REQUIRED');
    const res = await ctx.http().post(api('/agent/mandal-registrations')).set('Authorization', auth)
      .send({ orgName: 'Shiv Shakti Mitra Mandal', state: 'Maharashtra', city: 'Nagpur', contactName: 'Vikas', mobile, email, events: events2(), declarationAccepted: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'PENDING_REVIEW', source: 'AGENT', agent: { id: agent.id } });
    const decl = await ctx.prisma.legalDeclaration.findFirstOrThrow({ where: { registrationId: res.body.id } });
    expect(decl.onBehalf).toBe(true);
    // The contact can't log in yet; the email carries a single-use set-password link.
    const link = mail.outbox.filter((m) => m.to === email).pop()!.text.match(/set-password\?token=([\w-]+)/)![1];
    const set = await ctx.http().post(api('/auth/set-password')).send({ token: link, password: 'MyOwn@12345' });
    expect(set.status).toBe(200);
    expect(set.body.user.mandalRegistrations[0]).toMatchObject({ status: 'PENDING_REVIEW' });
    expect((await ctx.http().post(api('/auth/set-password')).send({ token: link, password: 'Again@12345' })).body.code).toBe('INVALID_LINK');
    expect((await ctx.http().post(api('/auth/login')).send({ identifier: mobile, password: 'MyOwn@12345' })).status).toBe(200);
    // The super admin sees it was registered via the agent; the agent sees it in its list.
    const adminView = (await ctx.http().get(api(`/platform/mandal-registrations/${res.body.id}`)).set('Authorization', sa)).body;
    expect(adminView.agent).toMatchObject({ name: 'Rakesh Kulkarni' });
    const list = (await ctx.http().get(api('/agent/mandals')).set('Authorization', auth)).body;
    expect(list.items.map((i: { id: string }) => i.id)).toContain(res.body.id);
    expect((await agentMe(auth)).stats).toMatchObject({ registered: 1, pending: 1 });
  });

  it('referral is EARNED only on the first paid fee, once; % commission on each paid fee; refunds reverse', async () => {
    const { agent, auth } = await createAgent();
    const m = await referredMandal(agent.code);
    expect((await agentMe(auth)).earnings.earned).toBe('0.00'); // approved but unpaid: nothing yet
    await pay(m.tokens[0]);
    let e = (await agentMe(auth)).earnings;
    expect(e).toMatchObject({ earned: '400.00', due: '400.00' }); // ₹300 referral + 10% of ₹1000
    await pay(m.tokens[0]); // retry of the same link
    await pay(m.tokens[1]);
    e = (await agentMe(auth)).earnings;
    expect(e.earned).toBe('600.00'); // + 10% of ₹2000, no second referral
    expect(await ctx.prisma.agentLedgerEntry.count({ where: { agentId: agent.id, kind: 'REGISTRATION', type: 'EARNED' } })).toBe(1);
    const ledger = (await ctx.http().get(api('/agent/ledger')).set('Authorization', auth)).body;
    expect(ledger.items.map((i: { kind: string; amount: string }) => `${i.kind}:${i.amount}`).sort()).toEqual(['COMMISSION:100.00', 'COMMISSION:200.00', 'REGISTRATION:300.00']);
    expect((await agentMe(auth)).stats).toMatchObject({ liveMandals: 1, liveEvents: 2 });

    // Refund of the second fee reverses its commission only.
    await ctx.http().post(api(`/platform/events/${m.events[1].id}/fee/refund`)).set('Authorization', sa).send({ reason: 'Duplicate payment' });
    expect((await agentMe(auth)).earnings).toMatchObject({ earned: '400.00', reversed: '200.00' });
  });

  it('two simultaneous payments of different events → exactly one registration referral', async () => {
    const { agent, auth } = await createAgent({ commissionPercent: '0' });
    const m = await referredMandal(agent.code, ['500', '700']);
    const [a, b] = await Promise.all(m.tokens.map(pay));
    expect([a.body.status, b.body.status]).toEqual(['PAID', 'PAID']);
    expect(await ctx.prisma.agentLedgerEntry.count({ where: { agentId: agent.id, kind: 'REGISTRATION' } })).toBe(1);
    expect(await ctx.prisma.agentLedgerEntry.count({ where: { agentId: agent.id, kind: 'COMMISSION' } })).toBe(0);
    expect((await agentMe(auth)).earnings.earned).toBe('300.00');
  });

  it('payouts can\'t exceed what is due; suspended agents keep read access but can\'t register or earn', async () => {
    const { agent, auth } = await createAgent();
    const m = await referredMandal(agent.code);
    await pay(m.tokens[0]); // earns 300 + 100
    const too = await ctx.http().post(api(`/platform/agents/${agent.id}/payouts`)).set('Authorization', sa).send({ amount: '401', paidOn: future(0), reference: 'UPI-1' });
    expect(too.status).toBe(400);
    expect(too.body.code).toBe('PAYOUT_EXCEEDS_DUE');
    const ok = await ctx.http().post(api(`/platform/agents/${agent.id}/payouts`)).set('Authorization', sa).send({ amount: '250', paidOn: future(0), reference: 'UPI-2', note: 'October' });
    expect(ok.status).toBe(200);
    expect(ok.body.earnings).toMatchObject({ earned: '400.00', paid: '250.00', due: '150.00' });
    // Concurrent payouts of the remaining due: only one fits.
    const both = await Promise.all([1, 2].map(() => ctx.http().post(api(`/platform/agents/${agent.id}/payouts`)).set('Authorization', sa).send({ amount: '150', paidOn: future(0), reference: 'UPI-3' })));
    expect(both.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await ctx.http().get(api('/agent/payouts')).set('Authorization', auth)).body.total).toBe(2);
    const row = (await ctx.http().get(api(`/platform/agents?q=${agent.code}`)).set('Authorization', sa)).body.items[0];
    expect(row).toMatchObject({ code: agent.code, earnings: { due: '0.00' }, stats: { registered: 1, approved: 1, liveMandals: 1 } });

    await ctx.http().patch(api(`/platform/agents/${agent.id}`)).set('Authorization', sa).send({ status: 'SUSPENDED', reason: 'Inactive' });
    expect((await ctx.http().get(api('/agent/me')).set('Authorization', auth)).status).toBe(200);
    expect((await ctx.http().post(api('/agent/mandal-registrations')).set('Authorization', auth).send({})).body.code).toBe('AGENT_SUSPENDED');
    expect((await ctx.http().get(api(`/public/referral/${agent.code}`))).body.valid).toBe(false);
    await pay(m.tokens[1]);
    expect((await agentMe(auth)).earnings.earned).toBe('400.00'); // suspended: no new commission
  });

  it('super admin attributes an existing mandal to an agent (audited); its next paid fee earns', async () => {
    const { agent, auth } = await createAgent();
    const m = await makeOrgWithEvent(ctx.prisma);
    const res = await ctx.http().post(api(`/platform/organizations/${m.org.id}/agent`)).set('Authorization', sa).send({ agentId: agent.id, reason: 'Visited by Rakesh in August' });
    expect(res.status).toBe(200);
    expect(await ctx.prisma.auditLog.count({ where: { organizationId: m.org.id, action: 'organization.agent_attributed' } })).toBe(1);
    const ev = await ctx.prisma.event.create({ data: { organizationId: m.org.id, name: 'New fest', festivalType: 'DIWALI', startDate: new Date(), endDate: new Date(), tokenPrefix: 'DIW', approvalStatus: 'SUBMITTED', feeQuotedPaise: 50000 } });
    await ctx.http().post(api(`/platform/events/${ev.id}/approve`)).set('Authorization', sa).send({});
    await ctx.http().post(api(`/platform/events/${ev.id}/fee/mark-paid`)).set('Authorization', sa).send({ method: 'CASH', reference: 'CASH-9' });
    expect((await agentMe(auth)).earnings.earned).toBe('350.00'); // 300 + 10% of 500
    const list = (await ctx.http().get(api('/agent/mandals')).set('Authorization', auth)).body;
    expect(list.attributed.map((o: { id: string }) => o.id)).toContain(m.org.id);
    const orgs = (await ctx.http().get(api(`/organizations?q=${encodeURIComponent(m.org.name)}`)).set('Authorization', sa)).body;
    expect(orgs.items[0].agent).toMatchObject({ id: agent.id });
  });
});
