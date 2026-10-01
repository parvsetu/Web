/** Platform-controlled mandal registration: self-registration → email code → super admin approval → pay link → LIVE. */
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, idem, makeToken, makeUser, scan, TestCtx } from './helpers';

describe('Mandal registration, review & event fee (e2e)', () => {
  let ctx: TestCtx;
  let mail: MailService;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  let n = 0;
  const fresh = () => {
    n++;
    return { email: `reg${Date.now()}${n}@test.dev`, mobile: `6${String(Date.now()).slice(-7)}${String(n).padStart(2, '0')}` };
  };
  const codeFor = (to: string) => mail.outbox.filter((m) => m.to === to).pop()?.text.match(/\b\d{6}\b/)?.[0];
  const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

  beforeAll(async () => {
    ctx = await bootApp();
    mail = ctx.app.get(MailService);
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
    // Deterministic fees for this file: mandal-independent quotes come from type rates.
    await ctx.http().put(api('/platform/event-fee-rates')).set('Authorization', sa).send({ scope: 'TYPE', key: 'GANESH_UTSAV', fee: '999' });
  });
  afterAll(async () => {
    await ctx.prisma.eventFeeRate.deleteMany({ where: { key: { in: ['GANESH_UTSAV', 'Fairs & Carnivals', 'MELA'] } } });
    await ctx.app.close();
  });

  function body(over: Record<string, unknown> = {}) {
    const { email, mobile } = fresh();
    return {
      orgName: `Shiv Shakti Mitra Mandal ${n}`, state: 'Maharashtra', city: 'Nagpur', address: 'Itwari, Nagpur',
      contactName: 'Vikas Deshmukh', mobile, email, password: 'Secret@1234', declarationAccepted: true,
      events: [
        { festivalType: 'GANESH_UTSAV', name: 'Ganeshotsav 2026', startDate: future(10), endDate: future(20), location: 'Itwari chowk pandal' },
        { custom: { name: `Tanha Pola ${n}`, group: 'Regional & Harvest', description: 'Children’s bullock festival with wooden bulls' }, name: 'Tanha Pola Utsav', startDate: future(30), endDate: future(31) },
      ],
      ...over,
    };
  }

  /** Self-registers, verifies the email, approves; returns the applicant auth + created events. */
  async function registeredAndApproved(over: Record<string, unknown> = {}, approve: Record<string, unknown> = {}) {
    const b = body(over);
    const reg = await ctx.http().post(api('/public/mandal-registrations')).send(b);
    expect(reg.status).toBe(201);
    const v = await ctx.http().post(api('/auth/verify-email')).send({ email: b.email, code: codeFor(b.email as string) });
    expect(v.status).toBe(200);
    const auth = `Bearer ${v.body.accessToken}`;
    const ok = await ctx.http().post(api(`/platform/mandal-registrations/${reg.body.registrationId}/approve`)).set('Authorization', sa).send(approve);
    expect(ok.status).toBe(200);
    return { b, auth, registrationId: reg.body.registrationId as string, approved: ok.body };
  }

  it('declaration is mandatory; referral codes are checked; the policy is public', async () => {
    const policy = await ctx.http().get(api('/public/legal/content-policy'));
    expect(policy.body).toMatchObject({ version: expect.any(String), rule: expect.stringContaining('liquor') });
    const noDecl = await ctx.http().post(api('/public/mandal-registrations')).send(body({ declarationAccepted: undefined }));
    expect(noDecl.status).toBe(400);
    expect(noDecl.body.code).toBe('DECLARATION_REQUIRED');
    const falseDecl = await ctx.http().post(api('/public/mandal-registrations')).send(body({ declarationAccepted: false }));
    expect(falseDecl.body.code).toBe('DECLARATION_REQUIRED');
    const badRef = await ctx.http().post(api('/public/mandal-registrations')).send(body({ referralCode: 'NOPE999' }));
    expect(badRef.body.code).toBe('INVALID_REFERRAL_CODE');
    const noEvents = await ctx.http().post(api('/public/mandal-registrations')).send(body({ events: [] }));
    expect(noEvents.status).toBe(400);
  });

  it('self-registration → verify → approve → org + admin + events created but NOT public → pay link → demo pay → LIVE and bookable', async () => {
    const b = body();
    const reg = await ctx.http().post(api('/public/mandal-registrations')).send(b);
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ verificationRequired: true, registrationId: expect.any(String) });
    // Not in the review queue until the email is verified.
    const before = await ctx.http().get(api('/platform/mandal-registrations?status=PENDING_REVIEW&q=' + encodeURIComponent(b.orgName))).set('Authorization', sa);
    expect(before.body.total).toBe(0);
    const decl = await ctx.prisma.legalDeclaration.findFirstOrThrow({ where: { registrationId: reg.body.registrationId } });
    expect(decl).toMatchObject({ context: 'REGISTRATION', version: expect.any(String), acceptedById: expect.any(String) });

    const v = await ctx.http().post(api('/auth/verify-email')).send({ email: b.email, code: codeFor(b.email) });
    expect(v.status).toBe(200);
    const auth = `Bearer ${v.body.accessToken}`;
    expect(v.body.user.organizations).toHaveLength(0);
    expect(v.body.user.mandalRegistrations[0]).toMatchObject({ status: 'PENDING_REVIEW', orgName: b.orgName });

    const queue = await ctx.http().get(api('/platform/mandal-registrations?status=PENDING_REVIEW&q=' + encodeURIComponent(b.orgName))).set('Authorization', sa);
    expect(queue.body.total).toBe(1);
    const item = queue.body.items[0];
    expect(item.requestedEvents).toHaveLength(2);
    expect(item.requestedEvents[0]).toMatchObject({ festivalType: 'GANESH_UTSAV', quotedFee: '999.00', feeSource: 'FESTIVAL_TYPE' });
    expect(item.requestedEvents[1]).toMatchObject({ festivalType: null, custom: { group: 'Regional & Harvest' } });

    // Non-admins can't review.
    expect((await ctx.http().post(api(`/platform/mandal-registrations/${item.id}/approve`)).set('Authorization', auth).send({})).status).toBe(403);

    const approved = await ctx.http().post(api(`/platform/mandal-registrations/${item.id}/approve`)).set('Authorization', sa).send({ events: [{ index: 1, addToCatalog: true, fee: '250' }] });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.events).toHaveLength(2);
    const [ganesh, pola] = approved.body.events;
    expect(ganesh).toMatchObject({ approvalStatus: 'APPROVED_AWAITING_PAYMENT', fee: '999.00', payment: { status: 'PENDING', payUrl: expect.stringContaining('/pay/event-fee/') } });
    expect(pola).toMatchObject({ approvalStatus: 'APPROVED_AWAITING_PAYMENT', fee: '250.00' });
    expect(mail.outbox.some((m) => m.to === b.email && /approved/.test(m.subject) && m.text.includes('/pay/event-fee/'))).toBe(true);

    // The applicant is now the Mandal Admin; allowed festival types come from the registration.
    const me = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body;
    expect(me.organizations).toHaveLength(1);
    expect(me.organizations[0].role.key).toBe('MANDAL_ADMIN');
    const orgId = me.organizations[0].id;
    const org = (await ctx.http().get(api(`/organizations/${orgId}`)).set('Authorization', auth)).body;
    expect(org.festivalTypes).toEqual(expect.arrayContaining(['GANESH_UTSAV', pola.festivalType]));
    const catalog = (await ctx.http().get(api('/public/festival-types'))).body as { key: string; custom?: boolean }[];
    expect(catalog.find((t) => t.key === pola.festivalType)).toMatchObject({ custom: true });

    // Not public, not bookable, no passes, no scanning, can't go ACTIVE — but can be set up.
    expect((await ctx.http().get(api(`/public/events/${ganesh.id}`))).status).toBe(404);
    const slot = await ctx.http().post(api(`/events/${ganesh.id}/time-slots`)).set('Authorization', auth).send({ label: 'Evening', startTime: '17:00', endTime: '23:00', price: '50' });
    expect(slot.status).toBe(201);
    expect((await ctx.http().patch(api(`/events/${ganesh.id}`)).set('Authorization', auth).send({ publicBookingEnabled: true })).status).toBe(200);
    const goActive = await ctx.http().patch(api(`/events/${ganesh.id}`)).set('Authorization', auth).send({ status: 'ACTIVE' });
    expect(goActive.status).toBe(409);
    expect(goActive.body.code).toBe('EVENT_NOT_LIVE');
    await ctx.prisma.orgBilling.update({ where: { organizationId: orgId }, data: { creditBalancePaise: 100000 } });
    const issue = await ctx.http().post(api(`/events/${ganesh.id}/tokens`)).set('Authorization', auth).send({ durationHours: 3 });
    expect(issue.status).toBe(409);
    expect(issue.body.code).toBe('EVENT_NOT_LIVE');
    const booking = (await ctx.http().get(api('/public/booking/events'))).body as { id: string }[];
    expect(booking.some((e) => e.id === ganesh.id)).toBe(false);
    expect((await ctx.http().get(api(`/public/booking/events/${ganesh.id}`))).status).toBe(404);

    // Pay through the shareable link (demo gateway).
    const token = ganesh.payment.payUrl.split('/pay/event-fee/')[1];
    const view = await ctx.http().get(api(`/public/event-fee/${token}`));
    expect(view.body).toMatchObject({ amount: '999.00', status: 'PENDING', event: { name: 'Ganeshotsav 2026', live: false }, organization: { name: b.orgName } });
    const failed = await ctx.http().post(api(`/public/event-fee/${token}/demo-pay`)).send({ outcome: 'fail' });
    expect(failed.body.status).toBe('PENDING');
    const paid = await ctx.http().post(api(`/public/event-fee/${token}/demo-pay`)).send({ outcome: 'success' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: 'PAID', event: { live: true } });
    // Retrying the paid link is idempotent.
    expect((await ctx.http().post(api(`/public/event-fee/${token}/demo-pay`)).send({ outcome: 'success' })).body.status).toBe('PAID');
    expect(await ctx.prisma.eventFeePayment.count({ where: { eventId: ganesh.id, status: 'PAID' } })).toBe(1);

    const ev = (await ctx.http().get(api(`/events/${ganesh.id}`)).set('Authorization', auth)).body;
    expect(ev).toMatchObject({ approvalStatus: 'LIVE', status: 'ACTIVE', approval: { fee: '999.00' } });
    expect((await ctx.http().get(api(`/public/events/${ganesh.id}`))).status).toBe(200);
    const nowBookable = (await ctx.http().get(api('/public/booking/events'))).body as { id: string }[];
    expect(nowBookable.some((e) => e.id === ganesh.id)).toBe(true);
    expect((await ctx.http().post(api(`/events/${ganesh.id}/tokens`)).set('Authorization', auth).send({ durationHours: 3 })).status).toBe(201);

    // The other event is still not live; its own fee is separate.
    expect((await ctx.http().get(api(`/public/events/${pola.id}`))).status).toBe(404);
    const summary = (await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa)).body;
    expect(Number(summary.eventFeesEarned)).toBeGreaterThanOrEqual(999);
    expect(Number(summary.totalEarned)).toBeGreaterThanOrEqual(Number(summary.eventFeesEarned));

    // The applicant's status page lists both events with their fee state.
    const mine = (await ctx.http().get(api('/me/mandal-registrations')).set('Authorization', auth)).body;
    expect(mine[0].events.map((e: { approvalStatus: string }) => e.approvalStatus).sort()).toEqual(['APPROVED_AWAITING_PAYMENT', 'LIVE']);
  });

  it('a not-live event can\'t scan passes; an expired / cancelled link can\'t be paid', async () => {
    const { auth, approved } = await registeredAndApproved();
    const ev = approved.events[0];
    const { qrPayload } = await makeToken(ctx, ev.id); // even a token inserted out of band is refused
    await ctx.prisma.event.update({ where: { id: ev.id }, data: { status: 'ACTIVE' } }); // operationally active, still not LIVE
    const res = await scan(ctx, auth, { eventId: ev.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(403);
    expect(res.body.result).toBe('UNAUTHORIZED');
    // Cancelled link (a new one was issued) and expired link.
    const oldToken = ev.payment.payUrl.split('/pay/event-fee/')[1];
    const fresh2 = await ctx.http().post(api(`/platform/events/${ev.id}/fee/link`)).set('Authorization', sa);
    expect(fresh2.body).toMatchObject({ status: 'PENDING', payUrl: expect.any(String) });
    expect((await ctx.http().post(api(`/public/event-fee/${oldToken}/demo-pay`)).send({ outcome: 'success' })).body.code).toBe('FEE_LINK_CLOSED');
    const newToken = fresh2.body.payUrl.split('/pay/event-fee/')[1];
    await ctx.prisma.eventFeePayment.updateMany({ where: { token: newToken }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await ctx.http().post(api(`/public/event-fee/${newToken}/demo-pay`)).send({ outcome: 'success' })).body.code).toBe('FEE_LINK_EXPIRED');
    expect((await ctx.http().get(api(`/public/event-fee/${newToken}`))).body.status).toBe('EXPIRED');
    // Email + share: the super admin can mail the open link to the contact.
    await ctx.http().post(api(`/platform/events/${ev.id}/fee/link`)).set('Authorization', sa);
    const mailed = await ctx.http().post(api(`/platform/events/${ev.id}/fee/email`)).set('Authorization', sa);
    expect(mailed.status).toBe(200);
    expect(mailed.body.sentTo).toHaveLength(1);
  });

  it('changes requested → applicant edits and resubmits; rejection is final', async () => {
    const b = body();
    const reg = await ctx.http().post(api('/public/mandal-registrations')).send(b);
    const v = await ctx.http().post(api('/auth/verify-email')).send({ email: b.email, code: codeFor(b.email) });
    const auth = `Bearer ${v.body.accessToken}`;
    const id = reg.body.registrationId;
    const ch = await ctx.http().post(api(`/platform/mandal-registrations/${id}/request-changes`)).set('Authorization', sa).send({ note: 'Please add the venue address' });
    expect(ch.body).toMatchObject({ status: 'CHANGES_REQUESTED', reviewNote: 'Please add the venue address' });
    expect((await ctx.http().post(api(`/platform/mandal-registrations/${id}/approve`)).set('Authorization', sa).send({})).status).toBe(409);
    const { password: _p, contactName: _c, mobile: _m, email: _e, ...details } = b;
    expect((await ctx.http().patch(api(`/me/mandal-registrations/${id}`)).set('Authorization', auth).send({ ...details, declarationAccepted: false })).body.code).toBe('DECLARATION_REQUIRED');
    const re = await ctx.http().patch(api(`/me/mandal-registrations/${id}`)).set('Authorization', auth).send({ ...details, address: 'Plot 4, Itwari' });
    expect(re.body).toMatchObject({ status: 'PENDING_REVIEW', address: 'Plot 4, Itwari' });
    const rej = await ctx.http().post(api(`/platform/mandal-registrations/${id}/reject`)).set('Authorization', sa).send({ reason: 'Liquor stall listed in the programme' });
    expect(rej.body.status).toBe('REJECTED');
    expect((await ctx.http().patch(api(`/me/mandal-registrations/${id}`)).set('Authorization', auth).send(details)).status).toBe(409);
    expect(await ctx.prisma.auditLog.count({ where: { entityId: id, action: { startsWith: 'registration.' } } })).toBeGreaterThanOrEqual(4);
  });

  it('FESTIVAL_NOT_ALLOWED: a mandal only runs its registered festival types (existing events keep working)', async () => {
    const { auth, approved } = await registeredAndApproved({ events: [{ festivalType: 'GANESH_UTSAV', name: 'Ganeshotsav', startDate: future(5), endDate: future(9) }] });
    const orgId = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body.organizations[0].id;
    const create = (t: string, a = auth) => ctx.http().post(api(`/organizations/${orgId}/events`)).set('Authorization', a).send({ name: 'Another', festivalType: t, startDate: future(40), endDate: future(41) });
    const bad = await create('DURGA_PUJA');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('FESTIVAL_NOT_ALLOWED');
    const ok = await create('GANESH_UTSAV');
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ approvalStatus: 'DRAFT', status: 'DRAFT' });
    const active = await ctx.http().post(api(`/organizations/${orgId}/events`)).set('Authorization', auth).send({ name: 'Xtra', festivalType: 'GANESH_UTSAV', startDate: future(40), endDate: future(41), status: 'ACTIVE' });
    expect(active.body).toMatchObject({ statusCode: 409, code: 'EVENT_NOT_LIVE' });
    // Changing an existing event's type is checked too.
    expect((await ctx.http().patch(api(`/events/${ok.body.id}`)).set('Authorization', auth).send({ festivalType: 'DURGA_PUJA' })).body.code).toBe('FESTIVAL_NOT_ALLOWED');
    // The mandal can't widen its own list; the super admin can, and isn't restricted when creating.
    expect((await ctx.http().patch(api(`/organizations/${orgId}`)).set('Authorization', auth).send({ festivalTypes: ['GANESH_UTSAV', 'DURGA_PUJA'] })).body.code).toBe('FESTIVAL_TYPES_LOCKED');
    expect((await create('DURGA_PUJA', sa)).status).toBe(201);
    // An existing event of a type outside the list keeps working (no type change = no check).
    const legacy = await ctx.prisma.event.create({ data: { organizationId: orgId, name: 'Old Holi', festivalType: 'HOLI', startDate: new Date(), endDate: new Date(), tokenPrefix: 'HOL', approvalStatus: 'LIVE', feeLegacy: true } });
    expect((await ctx.http().patch(api(`/events/${legacy.id}`)).set('Authorization', auth).send({ name: 'Old Holi Milan', festivalType: 'HOLI' })).status).toBe(200);
    expect(approved.status).toBe('APPROVED');
  });

  it('custom "not listed" event by an approved mandal: submit (declaration) → review → add to catalog', async () => {
    const { auth } = await registeredAndApproved({ events: [{ festivalType: 'GANESH_UTSAV', name: 'Ganeshotsav', startDate: future(5), endDate: future(9) }] });
    const orgId = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body.organizations[0].id;
    const label = `Marbat Procession ${Date.now()}`;
    const ev = await ctx.http().post(api(`/organizations/${orgId}/events`)).set('Authorization', auth)
      .send({ name: 'Marbat 2026', customFestival: { name: label, group: 'Religious Gatherings', description: 'Nagpur’s Marbat effigy procession' }, startDate: future(12), endDate: future(12) });
    expect(ev.status).toBe(201);
    expect(ev.body.festivalType).toMatch(/^MARBAT_PROCESSION/);
    expect(((await ctx.http().get(api('/public/festival-types'))).body as { key: string }[]).some((t) => t.key === ev.body.festivalType)).toBe(false);
    const noDecl = await ctx.http().post(api(`/events/${ev.body.id}/submit`)).set('Authorization', auth).send({});
    expect(noDecl.body.code).toBe('DECLARATION_REQUIRED');
    const sub = await ctx.http().post(api(`/events/${ev.body.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true });
    expect(sub.status).toBe(200);
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', customFestival: { status: 'PENDING', label } });
    expect(await ctx.prisma.legalDeclaration.count({ where: { eventId: ev.body.id, context: 'EVENT_SUBMISSION' } })).toBe(1);
    expect((await ctx.http().post(api(`/events/${ev.body.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true })).body.code).toBe('EVENT_ALREADY_SUBMITTED');

    const queue = (await ctx.http().get(api('/platform/event-reviews?status=SUBMITTED')).set('Authorization', sa)).body;
    expect(queue.items.some((i: { id: string }) => i.id === ev.body.id)).toBe(true);
    const ap = await ctx.http().post(api(`/platform/events/${ev.body.id}/approve`)).set('Authorization', sa).send({ fee: '300', addToCatalog: true });
    expect(ap.body).toMatchObject({ approval: { status: 'APPROVED_AWAITING_PAYMENT', fee: '300.00' }, customFestival: { status: 'APPROVED', inCatalog: true } });
    expect(((await ctx.http().get(api('/public/festival-types'))).body as { key: string }[]).some((t) => t.key === ev.body.festivalType)).toBe(true);
    expect((await ctx.http().get(api(`/organizations/${orgId}`)).set('Authorization', auth)).body.festivalTypes).toContain(ev.body.festivalType);
    const appr = (await ctx.http().get(api(`/events/${ev.body.id}/approval`)).set('Authorization', auth)).body;
    expect(appr.payments[0]).toMatchObject({ status: 'PENDING', amount: '300.00', payUrl: expect.any(String) });
  });

  it('request changes / reject / unpublish an event for a policy violation (audited)', async () => {
    const { auth, approved } = await registeredAndApproved({ events: [{ festivalType: 'GANESH_UTSAV', name: 'Ganeshotsav', startDate: future(5), endDate: future(9) }] });
    const orgId = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body.organizations[0].id;
    const ev = (await ctx.http().post(api(`/organizations/${orgId}/events`)).set('Authorization', auth).send({ name: 'Second', festivalType: 'GANESH_UTSAV', startDate: future(50), endDate: future(52) })).body;
    await ctx.http().post(api(`/events/${ev.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true });
    const ch = await ctx.http().post(api(`/platform/events/${ev.id}/request-changes`)).set('Authorization', sa).send({ note: 'Add the police permission number' });
    expect(ch.body.approval).toMatchObject({ status: 'CHANGES_REQUESTED', reviewNote: 'Add the police permission number' });
    expect((await ctx.http().post(api(`/events/${ev.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true })).body.status).toBe('SUBMITTED');
    const rej = await ctx.http().post(api(`/platform/events/${ev.id}/reject`)).set('Authorization', sa).send({ reason: 'Gambling stalls advertised' });
    expect(rej.body.approval.status).toBe('REJECTED');
    expect((await ctx.http().post(api(`/events/${ev.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true })).status).toBe(409);

    // Unpublish a LIVE event.
    const live = approved.events[0];
    await ctx.http().post(api(`/platform/events/${live.id}/fee/waive`)).set('Authorization', sa).send({ reason: 'Launch offer' });
    expect((await ctx.http().get(api(`/public/events/${live.id}`))).status).toBe(200);
    const un = await ctx.http().post(api(`/platform/events/${live.id}/unpublish`)).set('Authorization', sa).send({ reason: 'Liquor sold at the venue' });
    expect(un.body).toMatchObject({ status: 'DRAFT', approval: { status: 'REJECTED', reviewNote: 'Liquor sold at the venue' } });
    expect((await ctx.http().get(api(`/public/events/${live.id}`))).status).toBe(404);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { eventId: live.id, action: 'event.unpublished_policy_violation' } });
    expect(log.reason).toBe('Liquor sold at the venue');
  });

  it('fee precedence: mandal override > festival type > catalog group > platform default; locked at approval', async () => {
    const settings = (await ctx.http().get(api('/platform/billing/settings')).set('Authorization', sa)).body;
    try {
      await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ defaultEventFee: '499' });
      const q = async (t: string) => (await ctx.http().get(api(`/public/event-fee-quote?festivalType=${t}`))).body;
      expect(await q('CARNIVAL')).toEqual({ fee: '499.00', source: 'DEFAULT' });
      await ctx.http().put(api('/platform/event-fee-rates')).set('Authorization', sa).send({ scope: 'GROUP', key: 'Fairs & Carnivals', fee: '700' });
      expect(await q('CARNIVAL')).toEqual({ fee: '700.00', source: 'GROUP' });
      await ctx.http().put(api('/platform/event-fee-rates')).set('Authorization', sa).send({ scope: 'TYPE', key: 'MELA', fee: '850' });
      expect(await q('MELA')).toEqual({ fee: '850.00', source: 'FESTIVAL_TYPE' });
      expect(await q('CARNIVAL')).toEqual({ fee: '700.00', source: 'GROUP' });

      const { auth } = await registeredAndApproved({ events: [{ festivalType: 'MELA', name: 'Mela', startDate: future(5), endDate: future(9) }] });
      const orgId = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body.organizations[0].id;
      await ctx.http().patch(api(`/platform/billing/mandals/${orgId}`)).set('Authorization', sa).send({ eventFee: '111' });
      expect((await ctx.http().patch(api(`/organizations/${orgId}`)).set('Authorization', sa).send({ festivalTypes: ['MELA', 'CARNIVAL'] })).status).toBe(200);
      const ev = (await ctx.http().post(api(`/organizations/${orgId}/events`)).set('Authorization', auth).send({ name: 'Carnival', festivalType: 'CARNIVAL', startDate: future(60), endDate: future(61) })).body;
      expect((await ctx.http().get(api(`/events/${ev.id}/approval`)).set('Authorization', auth)).body.quote).toEqual({ fee: '111.00', source: 'MANDAL' });
      await ctx.http().post(api(`/events/${ev.id}/submit`)).set('Authorization', auth).send({ declarationAccepted: true });
      // Rates change after submission don't move the quote; approval locks it.
      await ctx.http().patch(api(`/platform/billing/mandals/${orgId}`)).set('Authorization', sa).send({ eventFee: null });
      const ap = await ctx.http().post(api(`/platform/events/${ev.id}/approve`)).set('Authorization', sa).send({});
      expect(ap.body.approval).toMatchObject({ status: 'APPROVED_AWAITING_PAYMENT', feeQuoted: '111.00', fee: '111.00' });
      expect(ap.body.payments[0].amount).toBe('111.00');
    } finally {
      await ctx.http().put(api('/platform/billing/settings')).set('Authorization', sa).send({ defaultEventFee: settings.defaultEventFee });
    }
  });

  it('super admin can mark a fee paid (cash / bank) or waive it; a zero fee goes live on approval', async () => {
    const { auth, approved } = await registeredAndApproved({
      events: [
        { festivalType: 'GANESH_UTSAV', name: 'One', startDate: future(5), endDate: future(6) },
        { festivalType: 'GANESH_UTSAV', name: 'Two', startDate: future(7), endDate: future(8) },
        { festivalType: 'GANESH_UTSAV', name: 'Three', startDate: future(9), endDate: future(10) },
      ],
    }, { events: [{ index: 2, fee: '0' }] });
    const [one, two, three] = approved.events;
    expect(three).toMatchObject({ approvalStatus: 'LIVE', fee: '0.00', payment: null });
    const before = Number((await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa)).body.eventFeesEarned);
    expect((await ctx.http().post(api(`/platform/events/${one.id}/fee/mark-paid`)).set('Authorization', auth).send({ method: 'CASH', reference: 'R1' })).status).toBe(403);
    expect((await ctx.http().post(api(`/platform/events/${one.id}/fee/mark-paid`)).set('Authorization', sa).send({ method: 'CHEQUE', reference: 'R1' })).status).toBe(400);
    const mp = await ctx.http().post(api(`/platform/events/${one.id}/fee/mark-paid`)).set('Authorization', sa).send({ method: 'BANK_TRANSFER', reference: 'UTR123456', note: 'NEFT' });
    expect(mp.status).toBe(200);
    expect(mp.body[0]).toMatchObject({ status: 'PAID', method: 'BANK_TRANSFER', paymentReference: 'UTR123456', payUrl: null });
    const wv = await ctx.http().post(api(`/platform/events/${two.id}/fee/waive`)).set('Authorization', sa).send({ reason: 'Charity event' });
    expect(wv.body[0]).toMatchObject({ status: 'WAIVED', method: 'WAIVER' });
    for (const e of [one, two]) expect((await ctx.http().get(api(`/events/${e.id}`)).set('Authorization', auth)).body.approvalStatus).toBe('LIVE');
    // A settled fee can't be settled again; waived money isn't revenue.
    expect((await ctx.http().post(api(`/platform/events/${one.id}/fee/waive`)).set('Authorization', sa).send({ reason: 'again' })).body.code).toBe('EVENT_NOT_AWAITING_PAYMENT');
    const after = Number((await ctx.http().get(api('/platform/billing/summary')).set('Authorization', sa)).body.eventFeesEarned);
    expect(after - before).toBe(999);
    expect(await ctx.prisma.auditLog.count({ where: { eventId: { in: [one.id, two.id] }, action: { in: ['event_fee.paid', 'event_fee.waived'] } } })).toBe(2);
  });

  it('refunds: no passes → back to awaiting payment (unpublished, new link); with passes → recorded only', async () => {
    const { auth, approved } = await registeredAndApproved({
      events: [
        { festivalType: 'GANESH_UTSAV', name: 'Refund A', startDate: future(5), endDate: future(6) },
        { festivalType: 'GANESH_UTSAV', name: 'Refund B', startDate: future(7), endDate: future(8) },
      ],
    });
    const [a, b] = approved.events;
    expect((await ctx.http().post(api(`/platform/events/${a.id}/fee/refund`)).set('Authorization', sa).send({ reason: 'not paid yet' })).body.code).toBe('NOTHING_TO_REFUND');
    for (const e of [a, b]) await ctx.http().post(api(`/platform/events/${e.id}/fee/mark-paid`)).set('Authorization', sa).send({ method: 'CASH', reference: `C-${e.id.slice(0, 4)}` });
    const ra = await ctx.http().post(api(`/platform/events/${a.id}/fee/refund`)).set('Authorization', sa).send({ reason: 'Festival called off' });
    expect(ra.body).toMatchObject({ unpublished: true, passesIssued: 0 });
    expect(ra.body.payments.map((p: { status: string }) => p.status)).toEqual(['PENDING', 'REFUNDED']);
    expect((await ctx.http().get(api(`/events/${a.id}`)).set('Authorization', auth)).body).toMatchObject({ approvalStatus: 'APPROVED_AWAITING_PAYMENT', status: 'DRAFT' });

    const orgId = (await ctx.http().get(api('/auth/me')).set('Authorization', auth)).body.organizations[0].id;
    await ctx.prisma.orgBilling.update({ where: { organizationId: orgId }, data: { creditBalancePaise: 100000 } });
    expect((await ctx.http().post(api(`/events/${b.id}/tokens`)).set('Authorization', auth).send({ durationHours: 3 })).status).toBe(201);
    const rb = await ctx.http().post(api(`/platform/events/${b.id}/fee/refund`)).set('Authorization', sa).send({ reason: 'Goodwill refund' });
    expect(rb.body).toMatchObject({ unpublished: false, passesIssued: 1 });
    expect((await ctx.http().get(api(`/events/${b.id}`)).set('Authorization', auth)).body.approvalStatus).toBe('LIVE');
    expect(await ctx.prisma.auditLog.count({ where: { eventId: { in: [a.id, b.id] }, action: 'event_fee.refunded' } })).toBe(2);
  });
});
