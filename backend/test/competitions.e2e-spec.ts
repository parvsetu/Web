/** Competitions: set-up, online-only paid entries (no login), eligibility, guardians, capacity, check-in, heats, results, certificates, refunds, isolation. */
import { bearer, bootApp, makeOrgWithEvent, makeVolunteer, TestCtx, uniqueMobile, verifyPayouts } from './helpers';

describe('Competitions (e2e)', () => {
  let ctx: TestCtx;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
  });
  afterAll(() => ctx.app.close());

  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const yearsAgo = (on: string, years: number, dayShift = 0) => {
    const d = new Date(`${on}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    d.setUTCDate(d.getUTCDate() + dayShift);
    return ymd(d);
  };

  /** A live festival with verified payouts and a published swimming competition (TIME, 6 lanes). */
  async function setup(opts: { capacity?: number | null; fee?: string; gst?: boolean; payouts?: boolean } = {}) {
    const m = await makeOrgWithEvent(ctx.prisma);
    const admin = bearer(ctx, m.admin);
    if (opts.payouts !== false) await verifyPayouts(ctx.prisma, m.org.id, m.admin.id);
    if (opts.gst) await ctx.prisma.event.update({ where: { id: m.event.id }, data: { gstEnabled: true } });
    const date = ymd(new Date(m.event.endDate.getTime() - 86400000));
    const r = await ctx.http().post(api(`/events/${m.event.id}/competitions`)).set('Authorization', admin).send({
      name: 'Swimming championship', kind: 'SWIMMING', resultType: 'TIME', date, startTime: '07:00', venue: 'Municipal pool', setting: 'OUTDOOR', lanes: 6,
      safetyDeclaration: 'The participant can swim 25 m unaided.', registrationOpen: true, isPublished: true,
      categories: [
        { name: '50 m freestyle · Under 14 · Girls', gender: 'FEMALE', minAge: 8, maxAge: 13, fee: opts.fee ?? '200', capacity: opts.capacity === undefined ? 20 : opts.capacity },
        { name: '50 m freestyle · Open', gender: 'ANY', minAge: 14, fee: '0' },
      ],
    });
    expect(r.status).toBe(201);
    return { ...m, admin, date, comp: r.body, girls: r.body.categories[0].id as string, open: r.body.categories[1].id as string };
  }

  const entryBody = (categoryId: string, date: string, extra: Record<string, unknown> = {}) => ({
    categoryId, participantName: `Riya Sharma ${Math.random().toString(36).slice(2, 6)}`, dateOfBirth: yearsAgo(date, 12), gender: 'FEMALE',
    phone: uniqueMobile(), guardianName: 'Sunita Sharma', guardianPhone: uniqueMobile(), guardianConsent: true,
    emergencyName: 'Sunita Sharma', emergencyPhone: uniqueMobile(), acceptDeclaration: true, ...extra,
  });
  const enter = (body: object) => ctx.http().post(api('/public/competitions/entries')).send(body);
  const pay = (id: string, k: string, outcome = 'success') => ctx.http().post(api(`/public/competitions/entries/${id}/demo-pay`)).send({ k, outcome });
  async function paidEntry(s: Awaited<ReturnType<typeof setup>>, extra: Record<string, unknown> = {}) {
    const e = await enter(entryBody(s.girls, s.date, extra));
    expect(e.status).toBe(201);
    const p = await pay(e.body.id, e.body.accessKey);
    expect(p.body.status).toBe('PAID');
    return { ...p.body, accessKey: e.body.accessKey as string };
  }

  it('shows published competitions publicly with fees and spots', async () => {
    const s = await setup();
    const pub = await ctx.http().get(api(`/public/events/${s.event.id}/competitions`));
    expect(pub.status).toBe(200);
    expect(pub.body[0]).toMatchObject({ name: 'Swimming championship', setting: 'OUTDOOR', closedReason: null, gstOnFees: false });
    expect(pub.body[0].categories[0]).toMatchObject({ fee: '200.00', spotsLeft: 20, full: false, results: null });
    expect(pub.body[0].categories[0].taken).toBeUndefined();
  });

  it('checks age on the day, gender, guardian consent and the declaration', async () => {
    const s = await setup();
    const tooOld = await enter(entryBody(s.girls, s.date, { dateOfBirth: yearsAgo(s.date, 14) }));
    expect(tooOld.body.code).toBe('NOT_ELIGIBLE');
    // Turns 14 the day after the competition: still 13 on the day → eligible.
    expect((await enter(entryBody(s.girls, s.date, { dateOfBirth: yearsAgo(s.date, 14, 1) }))).status).toBe(201);
    expect((await enter(entryBody(s.girls, s.date, { gender: 'MALE' }))).body.code).toBe('NOT_ELIGIBLE');
    expect((await enter(entryBody(s.girls, s.date, { guardianConsent: false }))).body.code).toBe('GUARDIAN_REQUIRED');
    expect((await enter(entryBody(s.girls, s.date, { acceptDeclaration: false }))).body.code).toBe('DECLARATION_REQUIRED');
  });

  it('takes the fee online, gives a bib number, splits the platform fee and blocks duplicates', async () => {
    const s = await setup();
    const body = entryBody(s.girls, s.date);
    const e = await enter(body);
    expect(e.status).toBe(201);
    expect(e.body).toMatchObject({ status: 'PENDING', amount: '200.00', bibNo: null, qrPayload: null, paymentProvider: 'demo' });
    expect((await ctx.http().get(api(`/public/competitions/entries/${e.body.id}`)).query({ k: 'wrong-key-wrong-key-xx' })).status).toBe(404);
    expect((await enter(body)).body.code).toBe('ALREADY_ENTERED');
    const p = await pay(e.body.id, e.body.accessKey);
    expect(p.body).toMatchObject({ status: 'PAID', bibNo: 1, qrPayload: `PVS-CMP:${e.body.id}`, invoiceNo: expect.stringMatching(/-CMP-\d{4}-00001$/) });
    const st = await ctx.prisma.paymentSettlement.findFirstOrThrow({ where: { sourceType: 'COMPETITION_ENTRY', sourceId: e.body.id } });
    expect(st).toMatchObject({ grossPaise: 20000, commissionPaise: 1000 });
    expect((await enter(body)).body.code).toBe('ALREADY_ENTERED');
    // Free category: paid immediately, next bib.
    const free = await enter(entryBody(s.open, s.date, { dateOfBirth: yearsAgo(s.date, 30), gender: 'MALE', guardianName: undefined, guardianPhone: undefined, guardianConsent: undefined }));
    expect(free.body).toMatchObject({ status: 'PAID', amount: '0.00', bibNo: 2 });
  });

  it('adds GST on top with a tax invoice when the festival charges GST', async () => {
    const s = await setup({ gst: true });
    const e = await paidEntry(s);
    expect(e).toMatchObject({ base: '200.00', gst: '36.00', amount: '236.00' });
    expect(e.invoiceNo).toMatch(/-CMP-\d{4}-00001$/);
  });

  it('never oversells a category, counting unpaid holds', async () => {
    const s = await setup({ capacity: 2 });
    const a = await enter(entryBody(s.girls, s.date));
    const b = await enter(entryBody(s.girls, s.date));
    expect([a.status, b.status]).toEqual([201, 201]);
    expect((await enter(entryBody(s.girls, s.date))).body.code).toBe('CATEGORY_FULL');
    await pay(a.body.id, a.body.accessKey, 'fail');
    expect((await enter(entryBody(s.girls, s.date))).status).toBe(201);
  });

  it('refuses paid entries until payouts are verified, and when registration is closed', async () => {
    const s = await setup({ payouts: false });
    expect((await enter(entryBody(s.girls, s.date))).body.code).toBe('PAYOUTS_NOT_READY');
    await ctx.http().patch(api(`/events/${s.event.id}/competitions/${s.comp.id}`)).set('Authorization', s.admin).send({ registrationOpen: false }).expect(200);
    expect((await enter(entryBody(s.open, s.date, { dateOfBirth: yearsAgo(s.date, 30) }))).body.code).toBe('REGISTRATION_CLOSED');
  });

  it('checks in by bib or QR, assigns heats from the middle lanes, ranks times and publishes results', async () => {
    const s = await setup();
    const people: { id: string; bibNo: number; accessKey: string }[] = [];
    for (let i = 0; i < 7; i++) people.push(await paidEntry(s, { participantName: `Swimmer${i} Kulkarni` }));
    const gate = bearer(ctx, await makeVolunteer(ctx.prisma, s.event.id, 'VOLUNTEER'));
    const byBib = await ctx.http().post(api(`/events/${s.event.id}/competitions/${s.comp.id}/check-in`)).set('Authorization', gate).send({ bibNo: people[0].bibNo });
    expect(byBib.status).toBe(201);
    expect(byBib.body).toMatchObject({ alreadyCheckedIn: false, entry: { bibNo: people[0].bibNo } });
    for (const p of people.slice(1)) {
      await ctx.http().post(api(`/events/${s.event.id}/competitions/${s.comp.id}/check-in`)).set('Authorization', s.admin).send({ entryId: p.id }).expect(201);
    }
    const again = await ctx.http().post(api(`/events/${s.event.id}/competitions/${s.comp.id}/check-in`)).set('Authorization', s.admin).send({ bibNo: people[0].bibNo });
    expect(again.body.alreadyCheckedIn).toBe(true);
    // A gate volunteer can check in but not see entrants' details or change set-up.
    expect((await ctx.http().get(api(`/events/${s.event.id}/competitions/${s.comp.id}/entries`)).set('Authorization', gate)).status).toBe(403);

    const h = await ctx.http().post(api(`/events/${s.event.id}/competitions/${s.comp.id}/heats`)).set('Authorization', s.admin).send({ categoryId: s.girls });
    expect(h.body).toEqual({ heats: 2, entries: 7 });
    const rows = await ctx.prisma.competitionEntry.findMany({ where: { categoryId: s.girls, status: 'PAID' } });
    // 7 swimmers, 6 lanes → heats of 4 and 3 (not 6 and 1), filled from the middle lanes.
    expect(rows.filter((r) => r.heat === 1).map((r) => r.lane).sort()).toEqual([2, 3, 4, 5]);
    expect(rows.filter((r) => r.heat === 2).map((r) => r.lane).sort()).toEqual([2, 3, 4]);

    const times = ['0:41.20', '0:39.80', '0:39.80', '0:45.00'];
    for (const [i, t] of times.entries()) {
      await ctx.http().patch(api(`/events/${s.event.id}/competition-entries/${people[i].id}/result`)).set('Authorization', s.admin).send({ resultStatus: 'FINISHED', time: t }).expect(200);
    }
    await ctx.http().patch(api(`/events/${s.event.id}/competition-entries/${people[4].id}/result`)).set('Authorization', s.admin).send({ resultStatus: 'DNF' }).expect(200);
    expect((await ctx.http().patch(api(`/events/${s.event.id}/competition-entries/${people[5].id}/result`)).set('Authorization', s.admin).send({ resultStatus: 'FINISHED' })).status).toBe(400);
    const ranks = Object.fromEntries((await ctx.prisma.competitionEntry.findMany({ where: { id: { in: people.map((p) => p.id) } } })).map((r) => [r.id, r.rank]));
    expect([0, 1, 2, 3, 4].map((i) => ranks[people[i].id])).toEqual([3, 1, 1, 4, null]);

    // Hidden until published.
    expect((await ctx.http().get(api(`/public/competitions/${s.comp.id}`))).body.categories[0].results).toBeNull();
    expect((await ctx.http().get(api(`/public/competitions/entries/${people[1].id}`)).query({ k: people[1].accessKey })).body).toMatchObject({ rank: null, certificateAvailable: false });
    expect((await ctx.http().get(api(`/public/competitions/entries/${people[1].id}/certificate`)).query({ k: people[1].accessKey })).status).toBe(404);
    await ctx.http().patch(api(`/events/${s.event.id}/competitions/${s.comp.id}`)).set('Authorization', s.admin).send({ resultsPublished: true }).expect(200);
    const pub = await ctx.http().get(api(`/public/competitions/${s.comp.id}`));
    expect(pub.body.categories[0].results.slice(0, 3)).toEqual([
      expect.objectContaining({ rank: 1, result: '39.80', name: expect.stringMatching(/^Swimmer\d K\.$/) }),
      expect.objectContaining({ rank: 1, result: '39.80' }),
      expect.objectContaining({ rank: 3, result: '41.20', name: 'Swimmer0 K.' }),
    ]);
    expect(JSON.stringify(pub.body)).not.toContain('Kulkarni');
    const cert = await ctx.http().get(api(`/public/competitions/entries/${people[1].id}/certificate`)).query({ k: people[1].accessKey });
    expect(cert.body).toMatchObject({ kind: 'WINNER', rank: 1, result: '39.80', participantName: 'Swimmer1 Kulkarni' });
    const dnf = await ctx.http().get(api(`/public/competitions/entries/${people[4].id}/certificate`)).query({ k: people[4].accessKey });
    expect(dnf.body).toMatchObject({ kind: 'PARTICIPATION', rank: null });

    const csv = await ctx.http().get(api(`/events/${s.event.id}/competitions/${s.comp.id}/entries.csv`)).set('Authorization', s.admin);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Swimmer1 Kulkarni');
  });

  it('cancels a paid entry with a refund, reverses the split and keeps paid competitions undeletable', async () => {
    const s = await setup();
    const e = await paidEntry(s);
    expect((await ctx.http().delete(api(`/events/${s.event.id}/competitions/${s.comp.id}`)).set('Authorization', s.admin)).body.code).toBe('HAS_PAID_ENTRIES');
    const tooMuch = await ctx.http().post(api(`/events/${s.event.id}/competition-entries/${e.id}/cancel`)).set('Authorization', s.admin).send({ reason: 'Pool closed', refund: '500' });
    expect(tooMuch.body.code).toBe('REFUND_TOO_HIGH');
    const c = await ctx.http().post(api(`/events/${s.event.id}/competition-entries/${e.id}/cancel`)).set('Authorization', s.admin).send({ reason: 'Pool closed', refundReference: 'UPI-123' });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ status: 'CANCELLED', refund: '200.00' });
    const refund = await ctx.prisma.paymentSettlement.findFirstOrThrow({ where: { sourceType: 'COMPETITION_REFUND', sourceId: `refund:${e.id}` } });
    expect(refund).toMatchObject({ grossPaise: -20000, commissionPaise: -1000 });
    expect((await ctx.http().post(api(`/events/${s.event.id}/competition-entries/${e.id}/cancel`)).set('Authorization', s.admin).send({ reason: 'again' })).status).toBe(409);
  });

  it('keeps other mandals and volunteers out of set-up; drafts stay private', async () => {
    const s = await setup();
    const other = await makeOrgWithEvent(ctx.prisma);
    const otherAuth = bearer(ctx, other.admin);
    expect((await ctx.http().get(api(`/events/${s.event.id}/competitions`)).set('Authorization', otherAuth)).status).toBe(404);
    expect((await ctx.http().patch(api(`/events/${other.event.id}/competitions/${s.comp.id}`)).set('Authorization', otherAuth).send({ name: 'Hijack' })).status).toBe(404);
    const gate = bearer(ctx, await makeVolunteer(ctx.prisma, s.event.id, 'VOLUNTEER'));
    expect((await ctx.http().post(api(`/events/${s.event.id}/competitions`)).set('Authorization', gate).send({ name: 'x', date: s.date, startTime: '07:00' })).status).toBe(403);
    await ctx.http().patch(api(`/events/${s.event.id}/competitions/${s.comp.id}`)).set('Authorization', s.admin).send({ isPublished: false }).expect(200);
    expect((await ctx.http().get(api(`/public/events/${s.event.id}/competitions`))).body).toEqual([]);
    expect((await ctx.http().get(api(`/public/competitions/${s.comp.id}`))).status).toBe(404);
  });

  it('keeps a removed category that has entries (inactive) instead of deleting it', async () => {
    const s = await setup();
    await paidEntry(s);
    const r = await ctx.http().patch(api(`/events/${s.event.id}/competitions/${s.comp.id}`)).set('Authorization', s.admin)
      .send({ categories: [{ id: s.open, name: '50 m freestyle · Open', minAge: 14, fee: '0' }] });
    expect(r.status).toBe(200);
    expect(r.body.keptInactive).toEqual(['50 m freestyle · Under 14 · Girls']);
    expect(r.body.categories.find((c: { id: string }) => c.id === s.girls)).toMatchObject({ isActive: false, paid: 1 });
  });
});
