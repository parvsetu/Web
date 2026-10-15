/** 80G: mandal profile + super-admin verification, server-decided eligibility, encrypted donor IDs, receipt versions, Form 10BD / 10BE. */
import { bearer, bootApp, makeOrgWithEvent, makeUser, systemRoleId, TestCtx } from './helpers';

describe('80G donation tax (e2e)', () => {
  let ctx: TestCtx;
  let sa: string;
  const api = (p: string) => `/api/v1${p}`;
  const PAN = 'ABCDE1234F';

  beforeAll(async () => {
    ctx = await bootApp();
    sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
  });
  afterAll(() => ctx.app.close());

  async function mandal() {
    const m = await makeOrgWithEvent(ctx.prisma);
    const auth = bearer(ctx, m.admin);
    const donate = (body: Record<string, unknown>) => ctx.http().post(api(`/events/${m.event.id}/donations`)).set('Authorization', auth).send(body);
    const profile = (body: Record<string, unknown>) => ctx.http().put(api(`/organizations/${m.org.id}/tax-profile`)).set('Authorization', auth).send(body);
    return { ...m, auth, donate, profile };
  }
  const profileBody = { urn: 'AAATS1234AF20214', urnIssuedOn: '2024-06-01', validFrom: '2024-04-01', validTo: '2029-03-31', pan: 'AAATS1234F' };
  const fy = () => {
    const d = new Date(Date.now() + 5.5 * 3600_000);
    const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  };

  it('the mandal submits, the super admin verifies; clients can never set status or the deduction', async () => {
    const m = await mandal();
    expect((await m.profile({ ...profileBody, status: 'VERIFIED' })).status).toBe(400);
    expect((await m.profile({ ...profileBody, deductionPercent: 100 })).status).toBe(400);
    expect((await m.profile({ ...profileBody, pan: 'BADPAN' })).status).toBe(400);
    const p = await m.profile(profileBody);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ status: 'SUBMITTED', pan: '••••••234F', deductionPercent: null });
    expect(JSON.stringify(p.body)).not.toContain('AAATS1234F');
    // Only the super admin reviews; another mandal can't even see it.
    expect((await ctx.http().post(api(`/platform/tax-profiles/${m.org.id}/review`)).set('Authorization', m.auth).send({ decision: 'VERIFY', deductionPercent: 50 })).status).toBe(403);
    const other = await mandal();
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/tax-profile`)).set('Authorization', other.auth)).status).toBe(404);
    expect((await ctx.http().post(api(`/platform/tax-profiles/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFY' })).body.code).toBe('DEDUCTION_REQUIRED');
    const v = await ctx.http().post(api(`/platform/tax-profiles/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFY', deductionPercent: 50 });
    expect(v.body.profile).toMatchObject({ status: 'VERIFIED', deductionPercent: 50 });
    // Editing a verified profile sends it back to review.
    expect((await m.profile({ ...profileBody, validTo: '2030-03-31' })).body).toMatchObject({ status: 'SUBMITTED', deductionPercent: null });
  });

  it('eligibility is decided by the server and follows every change; donor IDs are encrypted and masked', async () => {
    const m = await mandal();
    const named = await m.donate({ donorName: 'Ravi Kumar', amount: 5000, method: 'UPI', taxId: { idType: 'PAN', idNumber: 'abcde1234f', address: 'MG Road, Pune' } });
    expect(named.status).toBe(201);
    expect(named.body.tax).toMatchObject({ eligibleFor80G: false, ineligibleReason: 'NO_VERIFIED_80G', donorId: 'PAN ••••234F' });
    const noId = await m.donate({ donorName: 'Sita', amount: 1000, method: 'UPI' });
    const cash = await m.donate({ donorName: 'Big Cash', amount: 5000, method: 'CASH', taxId: { idType: 'AADHAAR', idNumber: '1234 5678 9012' } });
    const anon = await m.donate({ isAnonymous: true, amount: 2500, method: 'UPI' });
    expect((await m.donate({ isAnonymous: true, amount: 100, method: 'UPI', taxId: { idType: 'PAN', idNumber: PAN } })).status).toBe(201); // ignored, never stored
    // Clients can't claim eligibility.
    expect((await m.donate({ donorName: 'X', amount: 10, method: 'UPI', eligibleFor80G: true })).status).toBe(400);

    // Nothing stored in clear.
    const rec = await ctx.prisma.donationTaxRecord.findUniqueOrThrow({ where: { donationId: named.body.id } });
    expect(rec.idNumberEnc).not.toContain(PAN);
    expect(rec.idLast4).toBe('234F');
    const audits = await ctx.prisma.auditLog.findMany({ where: { organizationId: m.org.id } });
    expect(JSON.stringify(audits)).not.toContain(PAN);
    expect(await ctx.prisma.donationTaxRecord.count({ where: { donation: { isAnonymous: true, event: { organizationId: m.org.id } }, idType: { not: null } } })).toBe(0);

    // Receipt v1 says "not eligible".
    const r1 = await ctx.http().get(api(`/events/${m.event.id}/donations/${named.body.id}/receipt`)).set('Authorization', m.auth);
    expect(r1.body).toMatchObject({ eligibleFor80G: false, tax80G: null });

    await m.profile(profileBody);
    await ctx.http().post(api(`/platform/tax-profiles/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFY', deductionPercent: 50 }).expect(200);

    const list = await ctx.http().get(api(`/events/${m.event.id}/donations?pageSize=50`)).set('Authorization', m.auth);
    const tax = (id: string) => list.body.items.find((d: { id: string }) => d.id === id).tax;
    expect(tax(named.body.id)).toMatchObject({ eligibleFor80G: true, deductionPercent: 50 });
    expect(tax(noId.body.id)).toMatchObject({ eligibleFor80G: false, ineligibleReason: 'DONOR_ID_MISSING' });
    expect(tax(cash.body.id)).toMatchObject({ eligibleFor80G: false, ineligibleReason: 'CASH_OVER_LIMIT' });
    expect(tax(anon.body.id)).toMatchObject({ eligibleFor80G: false, ineligibleReason: 'ANONYMOUS' });
    expect(JSON.stringify(list.body)).not.toContain(PAN);

    // The receipt was re-issued as version 2 with the 80G block; v1 is superseded, not deleted.
    const r2 = await ctx.http().get(api(`/events/${m.event.id}/donations/${named.body.id}/receipt`)).set('Authorization', m.auth);
    expect(r2.body).toMatchObject({ eligibleFor80G: true, tax80G: { urn: 'AAATS1234AF20214', deductionPercent: 50, donorId: 'PAN ••••234F' } });
    const docs = await ctx.http().get(api(`/events/${m.event.id}/donations/${named.body.id}/documents`)).set('Authorization', m.auth);
    expect(docs.body.map((d: { version: number; status: string }) => [d.version, d.status])).toEqual([[2, 'ISSUED'], [1, 'SUPERSEDED']]);

    // Adding the PAN later makes the other donation eligible; an anonymous one refuses an ID.
    const set = await ctx.http().put(api(`/events/${m.event.id}/donations/${noId.body.id}/tax-id`)).set('Authorization', m.auth).send({ idType: 'PAN', idNumber: 'PQRSX6789K' });
    expect(set.body).toMatchObject({ eligibleFor80G: true, donorId: 'PAN ••••789K' });
    expect((await ctx.http().put(api(`/events/${m.event.id}/donations/${anon.body.id}/tax-id`)).set('Authorization', m.auth).send({ idType: 'PAN', idNumber: PAN })).body.code).toBe('ANONYMOUS_NO_TAX_ID');
    expect((await ctx.http().put(api(`/events/${m.event.id}/donations/${noId.body.id}/tax-id`)).set('Authorization', m.auth).send({ idType: 'PAN', idNumber: '12345' })).body.code).toBe('BAD_DONOR_ID');

    // Making a donation anonymous drops its ID and its 80G eligibility.
    const gone = await ctx.http().patch(api(`/events/${m.event.id}/donations/${noId.body.id}`)).set('Authorization', m.auth).send({ makeAnonymous: true });
    expect(gone.body.tax).toMatchObject({ eligibleFor80G: false, ineligibleReason: 'ANONYMOUS', donorId: null });
  });

  it('Form 10BD: per-donor summary, full IDs only in the export, filing; Form 10BE after filing; refund flags a revision', async () => {
    const m = await mandal();
    await m.profile(profileBody);
    await ctx.http().post(api(`/platform/tax-profiles/${m.org.id}/review`)).set('Authorization', sa).send({ decision: 'VERIFY', deductionPercent: 100 }).expect(200);
    const a = await m.donate({ donorName: 'Ravi Kumar', amount: 1000, method: 'UPI', taxId: { idType: 'PAN', idNumber: PAN, address: 'Pune' } });
    await m.donate({ donorName: 'Ravi Kumar', amount: 1500, method: 'CASH', taxId: { idType: 'PAN', idNumber: PAN } });
    await m.donate({ isAnonymous: true, amount: 300, method: 'CASH' });
    const year = (q = '') => ctx.http().get(api(`/organizations/${m.org.id}/tax/year?fy=${fy()}${q}`)).set('Authorization', m.auth);

    const y = await year();
    expect(y.status).toBe(200);
    expect(y.body.totals).toMatchObject({ donors: 1, eligibleDonations: 2, eligible: '2500.00', donations: '2800.00' });
    expect(y.body.anonymous).toMatchObject({ total: '300.00', above: '0.00' });
    expect(y.body.donors[0]).toMatchObject({ name: 'Ravi Kumar', donorId: 'PAN ••••234F', total: '2500.00', form10BE: { status: 'AWAITING_10BD' } });
    expect(JSON.stringify(y.body)).not.toContain(PAN);

    const csv = await year('&format=csv');
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(PAN);
    expect(csv.text).toContain('AAATS1234AF20214');
    expect(csv.text.split('\n')).toHaveLength(3); // header + UPI row + cash row
    // A report viewer sees the summary but can't export full IDs.
    const viewer = await makeUser(ctx.prisma);
    await ctx.prisma.organizationMember.create({ data: { organizationId: m.org.id, userId: viewer.id, roleId: await systemRoleId(ctx.prisma, 'REPORT_VIEWER') } });
    const vAuth = bearer(ctx, viewer);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/tax/year?fy=${fy()}`)).set('Authorization', vAuth)).status).toBe(200);
    expect((await ctx.http().get(api(`/organizations/${m.org.id}/tax/year?fy=${fy()}&format=csv`)).set('Authorization', vAuth)).status).toBe(403);
    expect(await ctx.prisma.auditLog.count({ where: { organizationId: m.org.id, action: 'tax.form_10bd_exported' } })).toBe(1);

    const donorKey = y.body.donors[0].donorKey;
    const issue = (cert: string) => ctx.http().post(api(`/organizations/${m.org.id}/tax/years/${fy()}/form-10be`)).set('Authorization', m.auth).send({ donorKey, certificateNumber: cert, issuedOn: '2027-05-20' });
    expect((await issue('CERT-0001')).body.code).toBe('FILE_10BD_FIRST');
    const filed = await ctx.http().post(api(`/organizations/${m.org.id}/tax/years/${fy()}/form-10bd`)).set('Authorization', m.auth).send({ ackNumber: 'ACK123456789', filedOn: '2027-05-10' });
    expect(filed.body.filing).toMatchObject({ status: 'FILED', ackNumber: 'ACK123456789', donors: 1, total: '2500.00' });
    expect(filed.body.donors[0].form10BE.status).toBe('READY');
    expect((await issue('CERT-0001')).body.donors[0].form10BE).toMatchObject({ status: 'ISSUED', certificateNo: 'CERT-0001', version: 1 });
    expect((await issue('CERT-0001-R')).body.donors[0].form10BE).toMatchObject({ certificateNo: 'CERT-0001-R', version: 2 });

    // A refund of a filed donation: receipt cancelled, filing needs a correction, no more 10BE until then.
    await ctx.http().patch(api(`/events/${m.event.id}/donations/${a.body.id}`)).set('Authorization', m.auth).send({ paymentStatus: 'REFUNDED', reason: 'Bounced' }).expect(200);
    const docs = await ctx.http().get(api(`/events/${m.event.id}/donations/${a.body.id}/documents`)).set('Authorization', m.auth);
    expect(docs.body[0]).toMatchObject({ kind: 'RECEIPT', status: 'CANCELLED' });
    const after = await year();
    expect(after.body.filing.status).toBe('REVISION_NEEDED');
    expect(after.body.totals.eligible).toBe('1500.00');
    expect((await issue('CERT-0002')).body.code).toBe('FILE_10BD_FIRST');
    // Filing the correction supersedes the original.
    const corrected = await ctx.http().post(api(`/organizations/${m.org.id}/tax/years/${fy()}/form-10bd`)).set('Authorization', m.auth).send({ ackNumber: 'ACK999', filedOn: '2027-05-25' });
    expect(corrected.body.filing).toMatchObject({ status: 'FILED', ackNumber: 'ACK999', total: '1500.00' });
    expect(corrected.body.filings.map((f: { status: string }) => f.status)).toEqual(['FILED', 'SUPERSEDED']);
  });
});
