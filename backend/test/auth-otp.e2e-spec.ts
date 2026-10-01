/** Email activation, resend cooldown, forgot/reset password — all via one-time codes. */
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, makeUser, TestCtx } from './helpers';

describe('Email verification & password reset (e2e)', () => {
  let ctx: TestCtx;
  let mail: MailService;
  const api = (p: string) => `/api/v1${p}`;
  const lastCode = (to: string) => mail.outbox.filter((m) => m.to === to).pop()?.text.match(/\b\d{6}\b/)?.[0];
  let n = 0;
  const fresh = () => {
    n++;
    return { email: `otp${Date.now()}${n}@test.dev`, mobile: `7${String(Date.now()).slice(-7)}${String(n).padStart(2, '0')}` };
  };

  beforeAll(async () => {
    ctx = await bootApp();
    mail = ctx.app.get(MailService);
  });
  afterAll(() => ctx.app.close());

  it('self-registered accounts cannot log in until the emailed code is entered', async () => {
    const { email, mobile } = fresh();
    const reg = await ctx.http().post(api('/auth/register')).send({ name: 'Asha', mobile, email, password: 'Secret@1234' });
    expect(reg.status).toBe(201);
    expect(reg.body.accessToken).toBeUndefined();
    expect(mail.outbox.some((m) => m.to === email && /verification/.test(m.subject))).toBe(true);

    const login = await ctx.http().post(api('/auth/login')).send({ identifier: mobile, password: 'Secret@1234' });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('EMAIL_NOT_VERIFIED');
    // Wrong password never reveals the verification state.
    const wrong = await ctx.http().post(api('/auth/login')).send({ identifier: mobile, password: 'nope-nope' });
    expect(wrong.status).toBe(401);

    expect((await ctx.http().post(api('/auth/verify-email')).send({ email, code: '000000' })).status).toBe(400);
    const ok = await ctx.http().post(api('/auth/verify-email')).send({ email, code: lastCode(email) });
    expect(ok.status).toBe(200);
    expect(ok.body.user.emailVerified).toBe(true);
    // Codes are single use.
    expect((await ctx.http().post(api('/auth/verify-email')).send({ email, code: lastCode(email) })).status).toBe(400);
    expect((await ctx.http().post(api('/auth/login')).send({ identifier: email, password: 'Secret@1234' })).status).toBe(200);
  });

  it('registration requires an email; resend has a cooldown; a new code supersedes the old one', async () => {
    const { email, mobile } = fresh();
    expect((await ctx.http().post(api('/auth/register')).send({ name: 'No Mail', mobile, password: 'Secret@1234' })).status).toBe(400);
    await ctx.http().post(api('/auth/register')).send({ name: 'Ravi', mobile, email, password: 'Secret@1234' });
    const first = lastCode(email);
    const sentBefore = mail.outbox.filter((m) => m.to === email).length;
    await ctx.http().post(api('/auth/resend-verification')).send({ email });
    expect(mail.outbox.filter((m) => m.to === email).length).toBe(sentBefore); // inside the 60 s cooldown

    // Age the code past the cooldown, resend, and the old code stops working.
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
    await ctx.prisma.emailOtp.updateMany({ where: { userId: user.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    const res = await ctx.http().post(api('/auth/resend-verification')).send({ email });
    expect(res.body).toEqual({ sent: true });
    const second = lastCode(email);
    expect(second).not.toBe(first);
    expect((await ctx.http().post(api('/auth/verify-email')).send({ email, code: first })).status).toBe(400);
    expect((await ctx.http().post(api('/auth/verify-email')).send({ email, code: second })).status).toBe(200);
    // Unknown address: same answer, nothing sent.
    const ghost = await ctx.http().post(api('/auth/resend-verification')).send({ email: 'nobody@test.dev' });
    expect(ghost.body).toEqual({ sent: true });
    expect(mail.outbox.some((m) => m.to === 'nobody@test.dev')).toBe(false);
  });

  it('only the hash of a code is stored, and 5 wrong guesses burn it', async () => {
    const u = await makeUser(ctx.prisma);
    await ctx.http().post(api('/auth/forgot-password')).send({ identifier: u.mobile });
    const code = lastCode(u.email!)!;
    const row = await ctx.prisma.emailOtp.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.codeHash).not.toContain(code);
    for (let i = 0; i < 5; i++) {
      await ctx.http().post(api('/auth/reset-password')).send({ identifier: u.mobile, code: code === '111111' ? '222222' : '111111', newPassword: 'NewSecret@1' });
    }
    const late = await ctx.http().post(api('/auth/reset-password')).send({ identifier: u.mobile, code, newPassword: 'NewSecret@1' });
    expect(late.status).toBe(400);
  });

  it('forgot password resets via the emailed code, revokes old sessions, and never reveals accounts', async () => {
    const u = await makeUser(ctx.prisma);
    const oldAuth = bearer(ctx, u);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', oldAuth)).status).toBe(200);

    const ghost = await ctx.http().post(api('/auth/forgot-password')).send({ identifier: '9999999999' });
    const real = await ctx.http().post(api('/auth/forgot-password')).send({ identifier: u.email });
    expect(ghost.status).toBe(200);
    expect(ghost.body).toEqual(real.body);

    const code = lastCode(u.email!)!;
    const reset = await ctx.http().post(api('/auth/reset-password')).send({ identifier: u.email, code, newPassword: 'BrandNew@123' });
    expect(reset.status).toBe(204);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', oldAuth)).status).toBe(401);
    expect((await ctx.http().post(api('/auth/login')).send({ identifier: u.mobile, password: 'BrandNew@123' })).status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerifiedAt).not.toBeNull();
  });

  it('logged-in users can verify their email from their profile', async () => {
    const u = await makeUser(ctx.prisma);
    const auth = bearer(ctx, u);
    const send = await ctx.http().post(api('/auth/me/email/send-code')).set('Authorization', auth);
    expect(send.body.sent).toBe(true);
    const v = await ctx.http().post(api('/auth/me/email/verify')).set('Authorization', auth).send({ code: lastCode(u.email!) });
    expect(v.body.emailVerified).toBe(true);
  });
});
