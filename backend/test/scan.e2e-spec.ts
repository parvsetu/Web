/**
 * The single-use guarantee: one QR token → exactly one successful entry, under
 * every ordering, retry and concurrency pattern we can throw at it.
 */
import { Prisma } from '@prisma/client';
import { ScanService } from '../src/modules/tokens/scan.service';
import { assign, bearer, bootApp, idem, makeOrgWithEvent, makeToken, makeUser, makeVolunteer, scan, TestCtx } from './helpers';

describe('Token scanning (e2e)', () => {
  let ctx: TestCtx;
  let event: { id: string; organizationId: string };
  let otherEvent: { id: string };
  let gate: Awaited<ReturnType<typeof makeVolunteer>>;
  let gateAuth: string;

  beforeAll(async () => {
    ctx = await bootApp();
    ({ event } = await makeOrgWithEvent(ctx.prisma));
    // A second event in the SAME org, so isolation is tested at event level, not just org level.
    otherEvent = await ctx.prisma.event.create({
      data: {
        organizationId: event.organizationId, name: 'Other festival', festivalType: 'NAVRATRI',
        startDate: new Date('2026-01-01'), endDate: new Date('2027-12-31'), status: 'ACTIVE', tokenPrefix: 'OTH',
      },
    });
    gate = await makeVolunteer(ctx.prisma, event.id, 'VOLUNTEER', 'Rahul');
    gateAuth = bearer(ctx, gate);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('1. first scan of an ACTIVE token succeeds and marks it USED', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true, result: 'SUCCESS', status: 'USED', message: 'Token verified successfully. Entry allowed.',
      tokenCode: token.tokenCode, scannedBy: { id: gate.id, name: 'Rahul' }, replayed: false,
    });
    expect(res.body.usedAt).toBeTruthy();
    const row = await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } });
    expect(row.status).toBe('USED');
    expect(row.usedById).toBe(gate.id);
  });

  it('2. second scan of the same token is refused as ALREADY_USED with the original usage', async () => {
    const { qrPayload } = await makeToken(ctx, event.id);
    const first = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    const second = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(first.body.result).toBe('SUCCESS');
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ success: false, result: 'ALREADY_USED', status: 'USED', message: 'This token has already been used.' });
    expect(second.body.usedAt).toBe(first.body.usedAt);
    expect(second.body.scannedBy).toEqual({ id: gate.id, name: 'Rahul' });
  });

  it('3. two devices scanning simultaneously → exactly one succeeds', async () => {
    const other = await makeVolunteer(ctx.prisma, event.id);
    for (let round = 0; round < 10; round++) {
      const { token, qrPayload } = await makeToken(ctx, event.id);
      const [a, b] = await Promise.all([
        scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() }),
        scan(ctx, bearer(ctx, other), { eventId: event.id, qrPayload, idempotencyKey: idem() }),
      ]);
      const results = [a.body.result, b.body.result].sort();
      expect(results).toEqual(['ALREADY_USED', 'SUCCESS']);
      expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'SUCCESS' } })).toBe(1);
    }
  });

  it('4. 20 concurrent requests from 20 devices → SUCCESS = 1, ALREADY_USED = 19', async () => {
    const devices = await Promise.all(Array.from({ length: 20 }, () => makeVolunteer(ctx.prisma, event.id)));
    const auths = devices.map((d) => bearer(ctx, d));
    for (let round = 0; round < 5; round++) {
      const { token, qrPayload } = await makeToken(ctx, event.id);
      const responses = await Promise.all(auths.map((auth) => scan(ctx, auth, { eventId: event.id, qrPayload, idempotencyKey: idem() })));
      const tally = responses.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.body.result]: (acc[r.body.result] ?? 0) + 1 }), {});
      expect(tally).toEqual({ SUCCESS: 1, ALREADY_USED: 19 });
      expect(responses.every((r) => r.status === 200)).toBe(true);

      const winner = responses.find((r) => r.body.success)!;
      const row = await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } });
      expect(row.status).toBe('USED');
      expect(row.usedById).toBe(winner.body.scannedBy.id);
      expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'SUCCESS' } })).toBe(1);
      expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'ALREADY_USED' } })).toBe(19);
    }
  });

  it('4b. 50 concurrent calls straight into ScanService (no HTTP layer) → exactly one success', async () => {
    const service = ctx.app.get(ScanService);
    const devices = await Promise.all(Array.from({ length: 50 }, () => makeVolunteer(ctx.prisma, event.id)));
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const outcomes = await Promise.all(
      devices.map((d) => service.scan({ id: d.id, name: d.name, isSuperAdmin: false }, { eventId: event.id, qrPayload, idempotencyKey: idem() }, {})),
    );
    expect(outcomes.filter((o) => o.body.success)).toHaveLength(1);
    expect(outcomes.filter((o) => o.body.result === 'ALREADY_USED')).toHaveLength(49);
    expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'SUCCESS' } })).toBe(1);
  });

  it('5. expired token → EXPIRED with its validUntil', async () => {
    const validUntil = new Date(Date.now() - 60_000);
    const { qrPayload } = await makeToken(ctx, event.id, { validFrom: new Date(Date.now() - 3600_000), validUntil });
    const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.body).toMatchObject({ success: false, result: 'EXPIRED', status: 'EXPIRED', message: 'This token has expired.' });
    expect(res.body.validUntil).toBe(validUntil.toISOString());
  });

  it('6. future token → NOT_YET_VALID with its validFrom', async () => {
    const validFrom = new Date(Date.now() + 3600_000);
    const { token, qrPayload } = await makeToken(ctx, event.id, { validFrom, validUntil: new Date(Date.now() + 7200_000) });
    const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.body).toMatchObject({ success: false, result: 'NOT_YET_VALID', message: 'This token is not valid yet.' });
    expect(res.body.validFrom).toBe(validFrom.toISOString());
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
  });

  it('7. cancelled token → CANCELLED', async () => {
    const { qrPayload } = await makeToken(ctx, event.id, { status: 'CANCELLED' });
    const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.body).toMatchObject({ success: false, result: 'CANCELLED', message: 'This token has been cancelled.' });
  });

  it('8. invalid tokens → INVALID, with no internals leaked', async () => {
    const { token } = await makeToken(ctx, event.id);
    const forgedSig = `PSQR1.${token.secureToken}.AAAAAAAAAAAAAAAAAAAAAA`;
    const unknownButSigned = ctx.qr.payloadFor('ZZZZZZZZZZZZZZZZZZZZZZ');
    for (const qrPayload of ['garbage', 'PSQR1.x.y', forgedSig, unknownButSigned, `'; DROP TABLE tokens; --`]) {
      const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: false, result: 'INVALID', message: 'The QR token could not be verified.', tokenCode: null });
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|sql|stack|select/i);
    }
    // The forged-signature attempt never touched the real token.
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
  });

  it('8b. a malformed request body is a 400, not a scan', async () => {
    const res = await scan(ctx, gateAuth, { eventId: event.id });
    expect(res.status).toBe(400);
    const res2 = await scan(ctx, gateAuth, { eventId: 'not-a-uuid', qrPayload: 'x' });
    expect(res2.status).toBe(400);
  });

  it('9. token from another event → WRONG_EVENT, without disclosing that event', async () => {
    await assign(ctx.prisma, otherEvent.id, gate.id, 'VOLUNTEER');
    const { token, qrPayload } = await makeToken(ctx, otherEvent.id);
    const res = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.body).toMatchObject({ success: false, result: 'WRONG_EVENT', message: 'This token is not valid for this event.', tokenCode: null });
    expect(JSON.stringify(res.body)).not.toContain(otherEvent.id);
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
  });

  it('10. a user without TOKEN_SCAN is refused (403 UNAUTHORIZED) and the token is untouched', async () => {
    const treasurer = await makeUser(ctx.prisma);
    await assign(ctx.prisma, event.id, treasurer.id, 'TREASURER');
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const res = await scan(ctx, bearer(ctx, treasurer), { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, result: 'UNAUTHORIZED' });
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
    const log = await ctx.prisma.scanLog.findFirstOrThrow({ where: { userId: treasurer.id }, orderBy: { scanTime: 'desc' } });
    expect(log.result).toBe('UNAUTHORIZED');
  });

  it('10b. an inactive (deactivated) volunteer is refused', async () => {
    const v = await makeUser(ctx.prisma);
    await assign(ctx.prisma, event.id, v.id, 'VOLUNTEER', 'INACTIVE');
    const { qrPayload } = await makeToken(ctx, event.id);
    const res = await scan(ctx, bearer(ctx, v), { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(403);
    expect(res.body.result).toBe('UNAUTHORIZED');
  });

  it('11. a volunteer of another event cannot scan this event, even with this event\'s real token', async () => {
    const outsider = await makeVolunteer(ctx.prisma, otherEvent.id);
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const res = await scan(ctx, bearer(ctx, outsider), { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(403);
    expect(res.body.result).toBe('UNAUTHORIZED');
    // …and claiming their own event while presenting this event's token gets WRONG_EVENT.
    const res2 = await scan(ctx, bearer(ctx, outsider), { eventId: otherEvent.id, qrPayload, idempotencyKey: idem() });
    expect(res2.body.result).toBe('WRONG_EVENT');
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('ACTIVE');
  });

  it('11b. scanning is closed for a non-ACTIVE event', async () => {
    const { event: draft, admin } = await makeOrgWithEvent(ctx.prisma, { status: 'COMPLETED' });
    const { qrPayload } = await makeToken(ctx, draft.id);
    const res = await scan(ctx, bearer(ctx, admin), { eventId: draft.id, qrPayload, idempotencyKey: idem() });
    expect(res.status).toBe(403);
    expect(res.body.result).toBe('UNAUTHORIZED');
  });

  it('12. a used token cannot be brought back through the scanner API', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    // Unknown body fields (status overrides, user ids) are rejected outright.
    const tampered = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, status: 'ACTIVE', idempotencyKey: idem() });
    expect(tampered.status).toBe(400);
    const spoof = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, scannerUserId: 'someone-else', idempotencyKey: idem() });
    expect(spoof.status).toBe(400);
    // A gate volunteer can't reach the admin recovery endpoint.
    const reactivate = await ctx.http()
      .post(`/api/v1/events/${event.id}/tokens/${token.id}/reactivate`)
      .set('Authorization', gateAuth)
      .send({ reason: 'please let them in again', confirmTokenCode: token.tokenCode });
    expect(reactivate.status).toBe(403);
    const again = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    expect(again.body.result).toBe('ALREADY_USED');
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: token.id } })).status).toBe('USED');
  });

  it('13. retrying the same request (same idempotencyKey) replays the result instead of scanning again', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const key = idem();
    const first = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: key });
    const retry = await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: key });
    expect(first.body).toMatchObject({ result: 'SUCCESS', replayed: false });
    // The device that got a timeout on the first attempt still learns "entry allowed" — for the ONE entry.
    expect(retry.body).toMatchObject({ result: 'SUCCESS', replayed: true, usedAt: first.body.usedAt });
    expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id } })).toBe(1);

    // Concurrent retries with one key: still one log row, one success.
    const { token: t2, qrPayload: q2 } = await makeToken(ctx, event.id);
    const k2 = idem();
    const burst = await Promise.all(Array.from({ length: 10 }, () => scan(ctx, gateAuth, { eventId: event.id, qrPayload: q2, idempotencyKey: k2 })));
    expect(burst.every((r) => r.body.result === 'SUCCESS')).toBe(true);
    expect(burst.filter((r) => !r.body.replayed)).toHaveLength(1);
    expect(await ctx.prisma.scanLog.count({ where: { tokenId: t2.id } })).toBe(1);
  });

  it('13c. reusing an idempotency key for a DIFFERENT token is refused, never replayed as success', async () => {
    const a = await makeToken(ctx, event.id);
    const b = await makeToken(ctx, event.id);
    const key = idem();
    expect((await scan(ctx, gateAuth, { eventId: event.id, qrPayload: a.qrPayload, idempotencyKey: key })).body.result).toBe('SUCCESS');
    const reused = await scan(ctx, gateAuth, { eventId: event.id, qrPayload: b.qrPayload, idempotencyKey: key });
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(reused.body.success).toBeUndefined();
    expect((await ctx.prisma.token.findUniqueOrThrow({ where: { id: b.token.id } })).status).toBe('ACTIVE');
  });

  it('13b. a retry WITHOUT a key can never produce a second success', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => scan(ctx, gateAuth, { eventId: event.id, qrPayload })));
    expect(results.filter((r) => r.body.success)).toHaveLength(1);
    expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'SUCCESS' } })).toBe(1);
  });

  it('14/16/17. a successful scan writes an audit row with the right user, event, token and request metadata', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() }).set('User-Agent', 'GateScanner/1.0');
    const log = await ctx.prisma.scanLog.findFirstOrThrow({ where: { tokenId: token.id } });
    expect(log).toMatchObject({ result: 'SUCCESS', userId: gate.id, eventId: event.id, method: 'QR', userAgent: 'GateScanner/1.0' });
    expect(log.ipAddress).toBeTruthy();
  });

  it('15. failed scans are logged too (every result type)', async () => {
    const v = await makeVolunteer(ctx.prisma, event.id);
    const auth = bearer(ctx, v);
    const expired = await makeToken(ctx, event.id, { validFrom: new Date(Date.now() - 7200_000), validUntil: new Date(Date.now() - 3600_000) });
    const future = await makeToken(ctx, event.id, { validFrom: new Date(Date.now() + 3600_000), validUntil: new Date(Date.now() + 7200_000) });
    const cancelled = await makeToken(ctx, event.id, { status: 'CANCELLED' });
    const wrong = await makeToken(ctx, otherEvent.id);
    const used = await makeToken(ctx, event.id);
    await scan(ctx, auth, { eventId: event.id, qrPayload: used.qrPayload });
    for (const q of [expired, future, cancelled, wrong, used]) await scan(ctx, auth, { eventId: event.id, qrPayload: q.qrPayload });
    await scan(ctx, auth, { eventId: event.id, qrPayload: 'nonsense' });
    await scan(ctx, auth, { eventId: otherEvent.id, qrPayload: used.qrPayload });

    const results = (await ctx.prisma.scanLog.findMany({ where: { userId: v.id }, select: { result: true } })).map((r) => r.result).sort();
    expect(results).toEqual(['ALREADY_USED', 'CANCELLED', 'EXPIRED', 'INVALID', 'NOT_YET_VALID', 'SUCCESS', 'UNAUTHORIZED', 'WRONG_EVENT']);
    // The wrong-event attempt isn't linked to the other event's token.
    const wrongLog = await ctx.prisma.scanLog.findFirstOrThrow({ where: { userId: v.id, result: 'WRONG_EVENT' } });
    expect(wrongLog.tokenId).toBeNull();
    expect(wrongLog.eventId).toBe(event.id);
  });

  it('18. the validity window is enforced at its exact boundaries', async () => {
    const service = ctx.app.get(ScanService);
    const user = { id: gate.id, name: gate.name, isSuperAdmin: false };
    const now = Date.now();
    // validUntil is exclusive: a window that ended 1s ago is expired.
    const justEnded = await makeToken(ctx, event.id, { validFrom: new Date(now - 60_000), validUntil: new Date(now - 1000) });
    // validFrom is inclusive: a window that opened 1s ago is open.
    const justOpened = await makeToken(ctx, event.id, { validFrom: new Date(now - 1000), validUntil: new Date(now + 60_000) });
    const opensSoon = await makeToken(ctx, event.id, { validFrom: new Date(now + 5000), validUntil: new Date(now + 60_000) });
    expect((await service.scan(user, { eventId: event.id, qrPayload: justEnded.qrPayload }, {})).body.result).toBe('EXPIRED');
    expect((await service.scan(user, { eventId: event.id, qrPayload: justOpened.qrPayload }, {})).body.result).toBe('SUCCESS');
    expect((await service.scan(user, { eventId: event.id, qrPayload: opensSoon.qrPayload }, {})).body.result).toBe('NOT_YET_VALID');
  });

  it('manual code entry requires TOKEN_MANUAL_ENTRY and is scoped to the event', async () => {
    const { token } = await makeToken(ctx, event.id);
    const plain = await scan(ctx, gateAuth, { eventId: event.id, tokenCode: token.tokenCode, idempotencyKey: idem() });
    expect(plain.status).toBe(403);
    const supervisor = await makeVolunteer(ctx.prisma, event.id, 'GATE_SUPERVISOR');
    const ok = await scan(ctx, bearer(ctx, supervisor), { eventId: event.id, tokenCode: token.tokenCode.toLowerCase(), idempotencyKey: idem() });
    expect(ok.body).toMatchObject({ result: 'SUCCESS', tokenCode: token.tokenCode });
    const log = await ctx.prisma.scanLog.findFirstOrThrow({ where: { tokenId: token.id, result: 'SUCCESS' } });
    expect(log.method).toBe('MANUAL');
  });

  it('a token-code guess for another event never resolves', async () => {
    const supervisor = await makeVolunteer(ctx.prisma, event.id, 'GATE_SUPERVISOR');
    const { token } = await makeToken(ctx, otherEvent.id);
    const res = await scan(ctx, bearer(ctx, supervisor), { eventId: event.id, tokenCode: token.tokenCode, idempotencyKey: idem() });
    expect(res.body.result).toBe('INVALID');
  });

  it('scan requires authentication', async () => {
    const { qrPayload } = await makeToken(ctx, event.id);
    const res = await ctx.http().post('/api/v1/tokens/scan').send({ eventId: event.id, qrPayload });
    expect(res.status).toBe(401);
  });

  it('database backstop: a second non-voided SUCCESS row for a token is physically impossible', async () => {
    const { token, qrPayload } = await makeToken(ctx, event.id);
    await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
    await expect(
      ctx.prisma.scanLog.create({ data: { tokenId: token.id, eventId: event.id, userId: gate.id, result: 'SUCCESS' } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    // And a USED row without usage details is rejected by a CHECK constraint.
    await expect(ctx.prisma.token.update({ where: { id: token.id }, data: { usedAt: null } })).rejects.toThrow();
  });

  describe('administrative recovery (reactivation)', () => {
    let adminAuth: string;
    beforeAll(async () => {
      const admin = await ctx.prisma.user.findFirstOrThrow({ where: { memberships: { some: { organizationId: event.organizationId } } } });
      adminAuth = bearer(ctx, admin);
    });

    it('requires reason + matching code, voids the old success, audits, and allows exactly one new entry', async () => {
      const { token, qrPayload } = await makeToken(ctx, event.id);
      await scan(ctx, gateAuth, { eventId: event.id, qrPayload, idempotencyKey: idem() });
      const url = `/api/v1/events/${event.id}/tokens/${token.id}/reactivate`;

      expect((await ctx.http().post(url).set('Authorization', adminAuth).send({ reason: 'short', confirmTokenCode: token.tokenCode })).status).toBe(400);
      expect((await ctx.http().post(url).set('Authorization', adminAuth).send({ reason: 'Visitor was turned back by mistake', confirmTokenCode: 'WRONG-CODE' })).status).toBe(400);
      const ok = await ctx.http().post(url).set('Authorization', adminAuth).send({ reason: 'Visitor was turned back by mistake', confirmTokenCode: token.tokenCode });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('ACTIVE');

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({ where: { entityId: token.id, action: 'token.reactivated' } });
      expect(audit.reason).toBe('Visitor was turned back by mistake');
      expect(await ctx.prisma.scanLog.count({ where: { tokenId: token.id, result: 'SUCCESS', voidedAt: { not: null } } })).toBe(1);

      const devices = await Promise.all(Array.from({ length: 10 }, () => makeVolunteer(ctx.prisma, event.id)));
      const burst = await Promise.all(devices.map((d) => scan(ctx, bearer(ctx, d), { eventId: event.id, qrPayload, idempotencyKey: idem() })));
      expect(burst.filter((r) => r.body.success)).toHaveLength(1);

      // A second reactivation attempt on an ACTIVE token is refused.
      const { token: t2 } = await makeToken(ctx, event.id);
      const refused = await ctx.http().post(`/api/v1/events/${event.id}/tokens/${t2.id}/reactivate`).set('Authorization', adminAuth)
        .send({ reason: 'Visitor was turned back by mistake', confirmTokenCode: t2.tokenCode });
      expect(refused.status).toBe(409);
    });
  });
});
