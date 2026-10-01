/** Own profile: name/mobile/email edits, password gate on login ids, re-verification, sign out other devices. */
import { MailService } from '../src/common/mail/mail.service';
import { bearer, bootApp, makeUser, TestCtx } from './helpers';

describe('My profile (e2e)', () => {
  let ctx: TestCtx;
  let mail: MailService;
  const api = (p: string) => `/api/v1${p}`;
  const lastCode = (to: string) => mail.outbox.filter((m) => m.to === to).pop()?.text.match(/\b\d{6}\b/)?.[0];
  beforeAll(async () => {
    ctx = await bootApp();
    mail = ctx.app.get(MailService);
  });
  afterAll(() => ctx.app.close());

  it('renames freely, but mobile/email changes need the current password and must be unique', async () => {
    const u = await makeUser(ctx.prisma);
    const other = await makeUser(ctx.prisma);
    const auth = bearer(ctx, u);
    const patch = (b: object) => ctx.http().patch(api('/auth/me')).set('Authorization', auth).send(b);
    expect((await patch({ name: 'Ananya S.' })).body.name).toBe('Ananya S.');
    expect((await patch({ mobile: '9123456780' })).body.code).toBe('PASSWORD_REQUIRED');
    expect((await patch({ mobile: '9123456780', currentPassword: 'wrong' })).body.code).toBe('PASSWORD_REQUIRED');
    expect((await patch({ mobile: other.mobile, currentPassword: 'Password@123' })).body.code).toBe('MOBILE_TAKEN');
    const m = await patch({ mobile: '91234 56780', currentPassword: 'Password@123' });
    expect(m.body.mobile).toBe('9123456780');
    expect((await ctx.http().post(api('/auth/login')).send({ identifier: '9123456780', password: 'Password@123' })).status).toBe(200);
  });

  it('a new email starts unverified, gets a code, and verifies', async () => {
    const u = await makeUser(ctx.prisma);
    await ctx.prisma.user.update({ where: { id: u.id }, data: { emailVerifiedAt: new Date() } });
    const auth = bearer(ctx, u);
    const email = `new-${u.id.slice(0, 8)}@test.dev`;
    const res = await ctx.http().patch(api('/auth/me')).set('Authorization', auth).send({ email: email.toUpperCase(), currentPassword: 'Password@123' });
    expect(res.body).toMatchObject({ email, emailVerified: false, verificationSent: true });
    const ok = await ctx.http().post(api('/auth/me/email/verify')).set('Authorization', auth).send({ code: lastCode(email) });
    expect(ok.body.emailVerified).toBe(true);
  });

  it('signing out other devices invalidates old tokens and returns a working new one', async () => {
    const u = await makeUser(ctx.prisma);
    const old = bearer(ctx, u);
    const r = await ctx.http().post(api('/auth/logout-other-devices')).set('Authorization', old);
    expect(r.status).toBe(200);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', old)).status).toBe(401);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${r.body.accessToken}`)).status).toBe(200);
  });

  it('changing the password keeps this device signed in with the returned token', async () => {
    const u = await makeUser(ctx.prisma);
    const old = bearer(ctx, u);
    const r = await ctx.http().post(api('/auth/change-password')).set('Authorization', old).send({ currentPassword: 'Password@123', newPassword: 'NewPass@456' });
    expect(r.status).toBe(200);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', old)).status).toBe(401);
    expect((await ctx.http().get(api('/auth/me')).set('Authorization', `Bearer ${r.body.accessToken}`)).status).toBe(200);
  });
});
