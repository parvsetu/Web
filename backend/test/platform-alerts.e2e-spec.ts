/** Super-admin alerts: new review items are emailed once per round, never twice; pending counts are super-admin only. */
import { MailService } from '../src/common/mail/mail.service';
import { PlatformAlertsService } from '../src/modules/platform-alerts/platform-alerts.service';
import { bearer, bootApp, makeOrgWithEvent, makeUser, TestCtx } from './helpers';

describe('Platform alerts (e2e)', () => {
  let ctx: TestCtx;
  let alerts: PlatformAlertsService;
  let mail: MailService;
  const api = (p: string) => `/api/v1${p}`;

  beforeAll(async () => {
    ctx = await bootApp();
    alerts = ctx.app.get(PlatformAlertsService);
    mail = ctx.app.get(MailService);
  });
  afterAll(() => ctx.app.close());

  it('first round only sets the marker; later rounds announce each new item exactly once', async () => {
    const sa = await makeUser(ctx.prisma, { isSuperAdmin: true });
    await ctx.prisma.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default', alertEmails: 'team@parvsetu.test' }, update: { alertsCheckedAt: null, alertEmails: 'team@parvsetu.test' } });
    const t0 = new Date();
    expect(await alerts.runOnce(t0)).toEqual([]);

    // A festival submitted for review and a new partner, after the marker.
    const m = await makeOrgWithEvent(ctx.prisma, { approvalStatus: 'DRAFT', status: 'DRAFT' });
    const t1 = new Date(t0.getTime() + 1000);
    await ctx.prisma.event.update({ where: { id: m.event.id }, data: { approvalStatus: 'SUBMITTED', submittedAt: t1 } });
    await ctx.prisma.partner.create({ data: { name: 'Amul Test', contactName: 'X', contactEmail: 'x@amul.test', contactPhone: '9000000000', status: 'PENDING', createdAt: t1 } });

    const before = mail.outbox.length;
    const t2 = new Date(t1.getTime() + 1000);
    const got = await alerts.runOnce(t2);
    expect(got.map((a) => a.tab).sort()).toEqual(['partners', 'reviews']);
    expect(got.find((a) => a.tab === 'reviews')?.title).toBe(`Festival submitted for review: ${m.event.name}`);
    const sent = mail.outbox.slice(before);
    expect(sent.map((s) => s.to)).toEqual(expect.arrayContaining([sa.email, 'team@parvsetu.test']));
    expect(sent[0].subject).toBe('Parvsetu: 2 new items waiting for review');
    expect(sent[0].text).toContain(`Festival submitted for review: ${m.event.name}`);
    expect(sent[0].text).toContain('/platform');

    // Nothing new → nothing sent; the same window can't be announced twice.
    const after = mail.outbox.length;
    expect(await alerts.runOnce(new Date(t2.getTime() + 1000))).toEqual([]);
    expect(mail.outbox.length).toBe(after);
  });

  it('pending counts are for super admins only', async () => {
    const sa = bearer(ctx, await makeUser(ctx.prisma, { isSuperAdmin: true }));
    const p = await ctx.http().get(api('/platform/pending')).set('Authorization', sa);
    expect(p.status).toBe(200);
    expect(p.body).toEqual(expect.objectContaining({ registrations: expect.any(Number), reviews: expect.any(Number), total: expect.any(Number) }));
    const m = await makeOrgWithEvent(ctx.prisma);
    expect((await ctx.http().get(api('/platform/pending')).set('Authorization', bearer(ctx, m.admin))).status).toBe(403);
    const set = await ctx.http().put(api('/platform/alert-settings')).set('Authorization', sa).send({ alertEmails: ' Ops@Parvsetu.test ; ceo@parvsetu.test ' });
    expect(set.body).toEqual({ alertEmails: 'ops@parvsetu.test, ceo@parvsetu.test' });
  });
});
