/**
 * Volunteers, roles/permissions, token validity configuration, reports access
 * and event isolation — all enforced server-side.
 */
import { DateTime } from 'luxon';
import { assign, bearer, bootApp, idem, makeOrgWithEvent, makeToken, makeUser, makeVolunteer, scan, systemRoleId, TestCtx } from './helpers';

const todayIst = () => DateTime.now().setZone('Asia/Kolkata').toISODate()!;

describe('Access control, volunteers, configuration, reports (e2e)', () => {
  let ctx: TestCtx;
  let org: { id: string };
  let event: { id: string; organizationId: string };
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let adminAuth: string;
  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    ctx = await bootApp();
    ({ org, event, admin } = await makeOrgWithEvent(ctx.prisma));
    adminAuth = bearer(ctx, admin);
  });
  afterAll(() => ctx.app.close());

  // ─── 19. Token validity configuration ───────────────────────────────

  describe('19. admin configures token validity', () => {
    it('creates slots, issues a slot token with the right concrete window, and handles midnight-crossing slots', async () => {
      const slot = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
        .send({ label: 'Evening 19-21', startTime: '19:00', endTime: '21:00', capacity: 3 });
      expect(slot.status).toBe(201);
      expect(slot.body.crossesMidnight).toBe(false);

      const date = todayIst();
      const tok = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
        .send({ timeSlotId: slot.body.id, date, visitorCount: 2 });
      // 19:00–21:00 IST = 13:30–15:30 UTC (unless the test runs after 21:00 IST, when the window has ended).
      const ended = DateTime.fromISO(`${date}T21:00`, { zone: 'Asia/Kolkata' }) <= DateTime.now();
      if (ended) {
        expect(tok.status).toBe(400);
      } else {
        expect(tok.status).toBe(201);
        expect(tok.body.validFrom).toBe(DateTime.fromISO(`${date}T19:00`, { zone: 'Asia/Kolkata' }).toUTC().toISO({ suppressMilliseconds: false }));
        expect(tok.body.validUntil).toBe(DateTime.fromISO(`${date}T21:00`, { zone: 'Asia/Kolkata' }).toUTC().toISO({ suppressMilliseconds: false }));
        expect(tok.body.tokenCode).toMatch(/^TST-\d{4}-\d{6}$/);
        expect(tok.body.qrPayload).toMatch(/^PSQR1\./);
        expect(tok.body.secureToken).toBeUndefined();
        // capacity 3, 2 used → a 2-person token is refused.
        const full = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
          .send({ timeSlotId: slot.body.id, date, visitorCount: 2 });
        expect(full.status).toBe(409);
        expect(full.body.code).toBe('SLOT_FULL');
      }

      const night = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth)
        .send({ label: 'Late night', startTime: '23:00', endTime: '01:00' });
      expect(night.body.crossesMidnight).toBe(true);
      const tomorrow = DateTime.now().setZone('Asia/Kolkata').plus({ days: 1 }).toISODate()!;
      const nt = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
        .send({ timeSlotId: night.body.id, date: tomorrow });
      expect(nt.status).toBe(201);
      expect(new Date(nt.body.validUntil).getTime() - new Date(nt.body.validFrom).getTime()).toBe(2 * 3600_000);

      const audit = await ctx.prisma.auditLog.findMany({ where: { eventId: event.id, action: 'timeslot.created' } });
      expect(audit.length).toBeGreaterThanOrEqual(2);
    });

    it('custom windows: admin may set them, a desk volunteer may not; bad windows rejected', async () => {
      const from = new Date(Date.now() + 3600_000).toISOString();
      const until = new Date(Date.now() + 7200_000).toISOString();
      const ok = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth).send({ validFrom: from, validUntil: until });
      expect(ok.status).toBe(201);
      expect(ok.body.effectiveStatus).toBe('NOT_YET_VALID');

      const desk = await makeVolunteer(ctx.prisma, event.id, 'TOKEN_ISSUER');
      const denied = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', bearer(ctx, desk)).send({ validFrom: from, validUntil: until });
      expect(denied.status).toBe(403);

      const backwards = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth).send({ validFrom: until, validUntil: from });
      expect(backwards.status).toBe(400);
      const both = await ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
        .send({ validFrom: from, validUntil: until, timeSlotId: '00000000-0000-0000-0000-000000000000', date: todayIst() });
      expect(both.status).toBe(400);
      const outside = await ctx.http().post(api(`/events/${event.id}/time-slots`)).set('Authorization', adminAuth).send({ label: 'x', startTime: '25:00', endTime: '26:00' });
      expect(outside.status).toBe(400);
    });

    it('changing a token\'s validity is audited and takes effect at the gate', async () => {
      const { token, qrPayload } = await makeToken(ctx, event.id, { validFrom: new Date(Date.now() + 3600_000), validUntil: new Date(Date.now() + 7200_000) });
      const gate = await makeVolunteer(ctx.prisma, event.id);
      expect((await scan(ctx, bearer(ctx, gate), { eventId: event.id, qrPayload })).body.result).toBe('NOT_YET_VALID');
      const res = await ctx.http().patch(api(`/events/${event.id}/tokens/${token.id}/validity`)).set('Authorization', adminAuth)
        .send({ validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 3600_000).toISOString(), reason: 'Moved to earlier slot' });
      expect(res.status).toBe(200);
      expect((await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityId: token.id, action: 'token.validity_changed' } })).reason).toBe('Moved to earlier slot');
      expect((await scan(ctx, bearer(ctx, gate), { eventId: event.id, qrPayload })).body.result).toBe('SUCCESS');
    });

    it('bulk generation produces unique codes and secure tokens', async () => {
      const res = await ctx.http().post(api(`/events/${event.id}/tokens/bulk`)).set('Authorization', adminAuth)
        .send({ count: 200, validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 3600_000).toISOString() });
      expect(res.status).toBe(201);
      expect(res.body.count).toBe(200);
      const codes = new Set(res.body.tokens.map((t: { tokenCode: string }) => t.tokenCode));
      const qrs = new Set(res.body.tokens.map((t: { qrPayload: string }) => t.qrPayload));
      expect(codes.size).toBe(200);
      expect(qrs.size).toBe(200);
    });

    it('cancel is audited and only works on ACTIVE tokens', async () => {
      const { token } = await makeToken(ctx, event.id);
      const url = api(`/events/${event.id}/tokens/${token.id}/cancel`);
      const res = await ctx.http().post(url).set('Authorization', adminAuth).send({ reason: 'Duplicate booking' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('CANCELLED');
      expect((await ctx.http().post(url).set('Authorization', adminAuth).send({ reason: 'again' })).status).toBe(409);
      expect(await ctx.prisma.auditLog.count({ where: { entityId: token.id, action: 'token.cancelled' } })).toBe(1);
    });
  });

  // ─── 27. Token uniqueness ─────────────────────────────────────────────

  it('27. token codes are unique per event and secure tokens globally; concurrent issuance never collides', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () =>
      ctx.http().post(api(`/events/${event.id}/tokens`)).set('Authorization', adminAuth)
        .send({ validFrom: new Date().toISOString(), validUntil: new Date(Date.now() + 3600_000).toISOString() })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.tokenCode)).size).toBe(25);
    const { token } = await makeToken(ctx, event.id);
    await expect(ctx.prisma.token.create({
      data: { eventId: event.id, tokenCode: token.tokenCode, secureToken: ctx.qr.newSecureToken(), validFrom: new Date(), validUntil: new Date(Date.now() + 1000) },
    })).rejects.toThrow();
    await expect(ctx.prisma.token.create({
      data: { eventId: event.id, tokenCode: 'TST-UNIQUE-1', secureToken: token.secureToken, validFrom: new Date(), validUntil: new Date(Date.now() + 1000) },
    })).rejects.toThrow();
  });

  // ─── 20-22. Volunteer lifecycle ─────────────────────────────────────

  describe('volunteer workflow', () => {
    it('20. admin creates a volunteer (one-time temp password), who can log in and scan only this event', async () => {
      const mobile = `7${Date.now().toString().slice(-9)}`;
      const res = await ctx.http().post(api(`/organizations/${org.id}/volunteers`)).set('Authorization', adminAuth)
        .send({ name: 'Gate Volunteer', mobile, eventId: event.id });
      expect(res.status).toBe(201);
      expect(res.body.temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(res.body.volunteer.assignments[0]).toMatchObject({ eventId: event.id, status: 'ACTIVE', role: { key: 'VOLUNTEER' } });

      const login = await ctx.http().post(api('/auth/login')).send({ identifier: mobile, password: res.body.temporaryPassword });
      expect(login.status).toBe(200);
      expect(login.body.user.events.map((e: { id: string }) => e.id)).toEqual([event.id]);
      expect(login.body.user.events[0].permissions).toEqual(['EVENT_VIEW', 'TOKEN_SCAN']);

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'volunteer.created', entityId: res.body.volunteer.userId } });
      expect(audit.actorId).toBe(admin.id);

      const dup = await ctx.http().post(api(`/organizations/${org.id}/volunteers`)).set('Authorization', adminAuth).send({ name: 'Duplicate', mobile, eventId: event.id });
      expect(dup.status).toBe(409);
    });

    it('21-22. self-registration grants nothing until an admin approves; approval assigns the chosen role', async () => {
      await ctx.prisma.event.update({ where: { id: event.id }, data: { volunteerRegistrationOpen: true } });
      const pub = await ctx.http().get(api('/public/events'));
      expect(pub.body.some((e: { id: string }) => e.id === event.id)).toBe(true);

      const mobile = `6${Date.now().toString().slice(-9)}`;
      const reg = await ctx.http().post(api('/auth/register')).send({
        name: 'Self Registered', mobile, password: 'Secret@1234', organizationId: org.id, eventId: event.id, message: 'Evenings',
      });
      expect(reg.status).toBe(201);
      expect(reg.body.user.events).toEqual([]);
      expect(reg.body.user.organizations).toEqual([]);
      expect(reg.body.user.applications[0].status).toBe('PENDING');
      const selfAuth = `Bearer ${reg.body.accessToken}`;

      // Can't scan, can't see the event, can't approve themselves.
      const { qrPayload } = await makeToken(ctx, event.id);
      expect((await scan(ctx, selfAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() })).status).toBe(403);
      expect((await ctx.http().get(api(`/events/${event.id}`)).set('Authorization', selfAuth)).status).toBe(404);
      const appId = reg.body.user.applications[0].id;
      const volunteerRole = await systemRoleId(ctx.prisma, 'VOLUNTEER');
      expect((await ctx.http().post(api(`/organizations/${org.id}/volunteer-applications/${appId}/approve`)).set('Authorization', selfAuth)
        .send({ eventId: event.id, roleId: volunteerRole })).status).toBe(404);

      const pending = await ctx.http().get(api(`/organizations/${org.id}/volunteer-applications?status=PENDING`)).set('Authorization', adminAuth);
      expect(pending.body.some((a: { id: string }) => a.id === appId)).toBe(true);
      const approve = await ctx.http().post(api(`/organizations/${org.id}/volunteer-applications/${appId}/approve`)).set('Authorization', adminAuth)
        .send({ eventId: event.id, roleId: volunteerRole });
      expect(approve.status).toBe(200);
      const again = await ctx.http().post(api(`/organizations/${org.id}/volunteer-applications/${appId}/approve`)).set('Authorization', adminAuth)
        .send({ eventId: event.id, roleId: volunteerRole });
      expect(again.status).toBe(409);

      expect((await scan(ctx, selfAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() })).body.result).toBe('SUCCESS');
    });

    it('deactivation is audited and immediately removes access; reactivation restores it', async () => {
      const v = await makeVolunteer(ctx.prisma, event.id);
      const auth = bearer(ctx, v);
      const off = await ctx.http().post(api(`/organizations/${org.id}/volunteers/${v.id}/deactivate`)).set('Authorization', adminAuth).send({ reason: 'Left early' });
      expect(off.status).toBe(200);
      const { qrPayload } = await makeToken(ctx, event.id);
      expect((await scan(ctx, auth, { eventId: event.id, qrPayload })).status).toBe(403);
      expect((await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'volunteer.deactivated', entityId: v.id } })).reason).toBe('Left early');
      await ctx.http().post(api(`/organizations/${org.id}/volunteers/${v.id}/activate`)).set('Authorization', adminAuth).send({});
      expect((await scan(ctx, auth, { eventId: event.id, qrPayload })).body.result).toBe('SUCCESS');
    });

    it('admin can see per-volunteer activity built from scan logs', async () => {
      const v = await makeVolunteer(ctx.prisma, event.id, 'VOLUNTEER', 'Activity Person');
      const auth = bearer(ctx, v);
      const a = await makeToken(ctx, event.id);
      const b = await makeToken(ctx, event.id, { validFrom: new Date(Date.now() - 7200_000), validUntil: new Date(Date.now() - 3600_000) });
      await scan(ctx, auth, { eventId: event.id, qrPayload: a.qrPayload });
      await scan(ctx, auth, { eventId: event.id, qrPayload: a.qrPayload });
      await scan(ctx, auth, { eventId: event.id, qrPayload: b.qrPayload });
      await scan(ctx, auth, { eventId: event.id, qrPayload: 'junk' });
      const res = await ctx.http().get(api(`/events/${event.id}/volunteers/${v.id}/activity`)).set('Authorization', adminAuth);
      expect(res.status).toBe(200);
      expect(res.body.stats).toMatchObject({ name: 'Activity Person', total: 4, successful: 1, duplicate: 1, expired: 1, invalid: 1, failed: 3 });
      expect(res.body.recentScans).toHaveLength(4);
      const stranger = await makeUser(ctx.prisma);
      expect((await ctx.http().get(api(`/events/${event.id}/volunteers/${stranger.id}/activity`)).set('Authorization', adminAuth)).status).toBe(404);
      const mine = await ctx.http().get(api(`/events/${event.id}/my-summary`)).set('Authorization', auth);
      expect(mine.body.me).toMatchObject({ scans: 4, successful: 1, duplicate: 1 });
    });
  });

  // ─── 23. Roles & permissions ────────────────────────────────────────

  describe('23. role permissions are enforced and escalation is blocked', () => {
    it('custom role grants exactly its permissions', async () => {
      const role = await ctx.http().post(api(`/organizations/${org.id}/roles`)).set('Authorization', adminAuth)
        .send({ name: 'Expense clerk', permissions: ['EVENT_VIEW', 'EXPENSE_VIEW', 'EXPENSE_CREATE'] });
      expect(role.status).toBe(201);
      const clerk = await makeUser(ctx.prisma);
      await ctx.prisma.eventAssignment.create({ data: { eventId: event.id, userId: clerk.id, roleId: role.body.id } });
      const auth = bearer(ctx, clerk);
      expect((await ctx.http().post(api(`/events/${event.id}/expenses`)).set('Authorization', auth)
        .send({ category: 'Flowers', description: 'Marigold', amount: '500', expenseDate: todayIst() })).status).toBe(201);
      expect((await ctx.http().get(api(`/events/${event.id}/donations`)).set('Authorization', auth)).status).toBe(403);
      expect((await ctx.http().get(api(`/events/${event.id}/reports/summary`)).set('Authorization', auth)).status).toBe(403);

      // Removing a permission from the role takes effect on the next request.
      await ctx.http().patch(api(`/organizations/${org.id}/roles/${role.body.id}`)).set('Authorization', adminAuth).send({ permissions: ['EVENT_VIEW', 'EXPENSE_VIEW'] });
      expect((await ctx.http().post(api(`/events/${event.id}/expenses`)).set('Authorization', auth)
        .send({ category: 'Flowers', description: 'Marigold', amount: '500', expenseDate: todayIst() })).status).toBe(403);
      expect(await ctx.prisma.auditLog.count({ where: { entityId: role.body.id, action: { in: ['role.created', 'role.updated'] } } })).toBe(2);
    });

    it('system roles cannot be edited; unknown permissions are rejected', async () => {
      const sys = await systemRoleId(ctx.prisma, 'VOLUNTEER');
      expect((await ctx.http().patch(api(`/organizations/${org.id}/roles/${sys}`)).set('Authorization', adminAuth).send({ permissions: ['EVENT_VIEW'] })).status).toBe(404);
      expect((await ctx.http().post(api(`/organizations/${org.id}/roles`)).set('Authorization', adminAuth).send({ name: 'X', permissions: ['GOD_MODE'] })).status).toBe(400);
    });

    it('a user manager cannot grant permissions they lack, edit admins, or change themselves', async () => {
      const managerRole = await ctx.http().post(api(`/organizations/${org.id}/roles`)).set('Authorization', adminAuth)
        .send({ name: 'People manager', permissions: ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'ROLE_VIEW', 'ROLE_CREATE', 'EVENT_VIEW'] });
      const manager = await makeUser(ctx.prisma);
      await ctx.prisma.organizationMember.create({ data: { organizationId: org.id, userId: manager.id, roleId: managerRole.body.id } });
      const auth = bearer(ctx, manager);
      const adminRole = await systemRoleId(ctx.prisma, 'MANDAL_ADMIN');

      const grantAdmin = await ctx.http().post(api(`/organizations/${org.id}/members`)).set('Authorization', auth)
        .send({ name: 'Friend', mobile: `5${Date.now().toString().slice(-9)}`, roleId: adminRole });
      expect(grantAdmin.status).toBe(403);
      expect(grantAdmin.body.code).toBe('ROLE_ESCALATION');

      const sneakyRole = await ctx.http().post(api(`/organizations/${org.id}/roles`)).set('Authorization', auth)
        .send({ name: 'Sneaky', permissions: ['TOKEN_REACTIVATE'] });
      expect(sneakyRole.status).toBe(403);

      expect((await ctx.http().patch(api(`/organizations/${org.id}/members/${admin.id}`)).set('Authorization', auth).send({ status: 'INACTIVE' })).status).toBe(403);
      expect((await ctx.http().patch(api(`/organizations/${org.id}/members/${manager.id}`)).set('Authorization', auth).send({ roleId: adminRole })).status).toBe(403);
    });

    it('JWTs carry no authority: the role is re-read from the database on every request', async () => {
      const v = await makeVolunteer(ctx.prisma, event.id);
      const auth = bearer(ctx, v);
      await ctx.prisma.eventAssignment.updateMany({ where: { userId: v.id }, data: { roleId: await systemRoleId(ctx.prisma, 'TREASURER') } });
      const { qrPayload } = await makeToken(ctx, event.id);
      expect((await scan(ctx, auth, { eventId: event.id, qrPayload })).status).toBe(403);
      // Disabling the account revokes the session outright.
      await ctx.prisma.user.update({ where: { id: v.id }, data: { status: 'DISABLED' } });
      expect((await ctx.http().get(api('/auth/me')).set('Authorization', auth)).status).toBe(401);
    });
  });

  // ─── 24-25. Reports access ─────────────────────────────────────────

  describe('reports', () => {
    it('24. a gate volunteer cannot reach admin reports, the dashboard, scan logs or finance', async () => {
      const v = await makeVolunteer(ctx.prisma, event.id);
      const auth = bearer(ctx, v);
      for (const path of ['reports/tokens', 'reports/visitors', 'reports/scans', 'reports/volunteers', 'reports/finance', 'reports/summary', 'dashboard', 'scans', 'donations', 'expenses', 'tokens', 'assignments']) {
        const res = await ctx.http().get(api(`/events/${event.id}/${path}`)).set('Authorization', auth);
        expect([path, res.status]).toEqual([path, 403]);
      }
      expect((await ctx.http().get(api(`/organizations/${org.id}/volunteers`)).set('Authorization', auth)).status).toBe(404);
    });

    it('25. admin sees reports computed from real data', async () => {
      const { event: ev, admin: a } = await makeOrgWithEvent(ctx.prisma);
      const auth = bearer(ctx, a);
      const gate = await makeVolunteer(ctx.prisma, ev.id);
      const g = bearer(ctx, gate);
      const t1 = await makeToken(ctx, ev.id, { extra: { visitorCount: 3 } });
      const t2 = await makeToken(ctx, ev.id);
      await makeToken(ctx, ev.id, { status: 'CANCELLED' });
      await makeToken(ctx, ev.id, { validFrom: new Date(Date.now() - 7200_000), validUntil: new Date(Date.now() - 3600_000) });
      await makeToken(ctx, ev.id);
      await scan(ctx, g, { eventId: ev.id, qrPayload: t1.qrPayload });
      await scan(ctx, g, { eventId: ev.id, qrPayload: t2.qrPayload });
      await scan(ctx, g, { eventId: ev.id, qrPayload: t1.qrPayload });
      await scan(ctx, g, { eventId: ev.id, qrPayload: 'junk' });

      const tokens = (await ctx.http().get(api(`/events/${ev.id}/reports/tokens`)).set('Authorization', auth)).body;
      expect(tokens).toMatchObject({ total: 5, used: 2, active: 1, expired: 1, cancelled: 1 });
      const visitors = (await ctx.http().get(api(`/events/${ev.id}/reports/visitors`)).set('Authorization', auth)).body;
      expect(visitors).toMatchObject({ totalEntries: 2, totalVisitors: 4 });
      const scans = (await ctx.http().get(api(`/events/${ev.id}/reports/scans`)).set('Authorization', auth)).body;
      expect(scans).toMatchObject({ total: 4, success: 2, alreadyUsed: 1, invalid: 1, failed: 2 });
      const vols = (await ctx.http().get(api(`/events/${ev.id}/reports/volunteers`)).set('Authorization', auth)).body;
      expect(vols).toEqual([expect.objectContaining({ userId: gate.id, total: 4, successful: 2, duplicate: 1, invalid: 1 })]);

      await ctx.http().post(api(`/events/${ev.id}/donations`)).set('Authorization', auth).send({ donorName: 'D', amount: '1000', method: 'CASH' });
      await ctx.http().post(api(`/events/${ev.id}/expenses`)).set('Authorization', auth).send({ category: 'Bhog', description: 'x', amount: 250.5, expenseDate: todayIst() });
      const summary = (await ctx.http().get(api(`/events/${ev.id}/reports/summary`)).set('Authorization', auth)).body;
      expect(summary).toMatchObject({
        tokens: { total: 5, used: 2, unused: 1, expired: 1, cancelled: 1 }, visitors: { total: 4, entries: 2 },
        donations: { total: '1000.00', count: 1 }, expenses: { total: '250.50', count: 1 }, balance: '749.50', restricted: [],
      });
      const dash = await ctx.http().get(api(`/events/${ev.id}/dashboard`)).set('Authorization', auth);
      expect(dash.status).toBe(200);
      expect(dash.body.today.entries).toBe(2);
      expect(dash.body.recentScans).toHaveLength(4);

      const csv = await ctx.http().get(api(`/events/${ev.id}/reports/volunteers?format=csv`)).set('Authorization', auth);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text.split('\n')[0]).toContain('userId');
    });

    it('a gate supervisor sees entry reports but financial figures are withheld', async () => {
      const sup = await makeVolunteer(ctx.prisma, event.id, 'GATE_SUPERVISOR');
      const auth = bearer(ctx, sup);
      const summary = await ctx.http().get(api(`/events/${event.id}/reports/summary`)).set('Authorization', auth);
      expect(summary.status).toBe(200);
      expect(summary.body).toMatchObject({ donations: null, expenses: null, balance: null, restricted: ['donations', 'expenses', 'balance'] });
      expect((await ctx.http().get(api(`/events/${event.id}/reports/finance`)).set('Authorization', auth)).status).toBe(403);
      expect((await ctx.http().get(api(`/events/${event.id}/reports/tokens?format=csv`)).set('Authorization', auth)).status).toBe(403);
      const dash = await ctx.http().get(api(`/events/${event.id}/dashboard`)).set('Authorization', auth);
      expect(dash.body.overall.donations).toBeNull();
    });

    it('report viewer can read but not modify', async () => {
      const viewer = await makeUser(ctx.prisma);
      await ctx.prisma.organizationMember.create({ data: { organizationId: org.id, userId: viewer.id, roleId: await systemRoleId(ctx.prisma, 'REPORT_VIEWER') } });
      const auth = bearer(ctx, viewer);
      expect((await ctx.http().get(api(`/events/${event.id}/reports/summary`)).set('Authorization', auth)).status).toBe(200);
      expect((await ctx.http().get(api(`/events/${event.id}/reports/finance`)).set('Authorization', auth)).status).toBe(200);
      expect((await ctx.http().post(api(`/events/${event.id}/donations`)).set('Authorization', auth).send({ donorName: 'D', amount: '1', method: 'CASH' })).status).toBe(403);
      expect((await ctx.http().patch(api(`/events/${event.id}`)).set('Authorization', auth).send({ name: 'Hacked' })).status).toBe(403);
      const { qrPayload } = await makeToken(ctx, event.id);
      expect((await scan(ctx, auth, { eventId: event.id, qrPayload })).status).toBe(403);
    });
  });

  // ─── 26. Event & organization isolation ─────────────────────────────

  describe('26. isolation', () => {
    it('another mandal\'s admin gets 404 on every route of this mandal and event', async () => {
      const { admin: otherAdmin } = await makeOrgWithEvent(ctx.prisma);
      const auth = bearer(ctx, otherAdmin);
      const { token } = await makeToken(ctx, event.id);
      for (const path of [
        `/events/${event.id}`, `/events/${event.id}/tokens`, `/events/${event.id}/tokens/${token.id}`, `/events/${event.id}/reports/summary`,
        `/events/${event.id}/donations`, `/organizations/${org.id}/volunteers`, `/organizations/${org.id}/members`, `/organizations/${org.id}/audit-logs`,
      ]) {
        const res = await ctx.http().get(api(path)).set('Authorization', auth);
        expect([path, res.status]).toEqual([path, 404]);
      }
      expect((await ctx.http().post(api(`/events/${event.id}/tokens/${token.id}/cancel`)).set('Authorization', auth).send({ reason: 'sabotage' })).status).toBe(404);
      expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
      // Can't assign someone into this event, nor pull a stranger into their own event by id.
      const { event: theirEvent } = await ctx.prisma.organizationMember.findFirstOrThrow({ where: { userId: otherAdmin.id }, include: { organization: { include: { events: true } } } })
        .then((m) => ({ event: m.organization.events[0] }));
      const res = await ctx.http().post(api(`/events/${theirEvent.id}/assignments`)).set('Authorization', auth)
        .send({ userId: admin.id, roleId: await systemRoleId(ctx.prisma, 'VOLUNTEER') });
      expect(res.status).toBe(404);
    });

    it('a token id from another event cannot be addressed through this event', async () => {
      const { event: ev2, admin: a2 } = await makeOrgWithEvent(ctx.prisma);
      const { token } = await makeToken(ctx, ev2.id);
      await assign(ctx.prisma, ev2.id, admin.id, 'VOLUNTEER');
      // Admin of event A addresses event B's token through event A's URL.
      expect((await ctx.http().get(api(`/events/${event.id}/tokens/${token.id}`)).set('Authorization', adminAuth)).status).toBe(404);
      expect((await ctx.http().post(api(`/events/${event.id}/tokens/${token.id}/cancel`)).set('Authorization', adminAuth).send({ reason: 'cross' })).status).toBe(404);
      expect(a2).toBeDefined();
    });

    it('/auth/me and /events only list events the user is actually authorized for', async () => {
      const v = await makeVolunteer(ctx.prisma, event.id);
      const me = await ctx.http().get(api('/auth/me')).set('Authorization', bearer(ctx, v));
      expect(me.body.events.map((e: { id: string }) => e.id)).toEqual([event.id]);
      const list = await ctx.http().get(api('/events')).set('Authorization', bearer(ctx, v));
      expect(list.body.map((e: { id: string }) => e.id)).toEqual([event.id]);
    });
  });

  describe('platform', () => {
    it('only a super admin can create organizations or manage users', async () => {
      expect((await ctx.http().post(api('/organizations')).set('Authorization', adminAuth).send({ name: 'New Mandal' })).status).toBe(403);
      expect((await ctx.http().get(api('/users')).set('Authorization', adminAuth)).status).toBe(403);
      const sa = await makeUser(ctx.prisma, { isSuperAdmin: true });
      const created = await ctx.http().post(api('/organizations')).set('Authorization', bearer(ctx, sa)).send({ name: 'New Mandal' });
      expect(created.status).toBe(201);
      expect(created.body.slug).toMatch(/^new-mandal/);
    });

    it('login does not reveal whether an account exists', async () => {
      const wrongPw = await ctx.http().post(api('/auth/login')).send({ identifier: admin.mobile, password: 'nope-nope' });
      const noUser = await ctx.http().post(api('/auth/login')).send({ identifier: '9999999999', password: 'nope-nope' });
      expect(wrongPw.status).toBe(401);
      expect(noUser.status).toBe(401);
      expect(wrongPw.body.message).toBe(noUser.body.message);
    });
  });
});
