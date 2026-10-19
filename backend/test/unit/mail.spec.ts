import { MailService } from '../../src/common/mail/mail.service';

const mail = { to: 'a@b.dev', subject: '123456 is your code', text: 'code 123456', html: '<p>123456</p>' };
const keys = ['MAIL_TRANSPORT', 'BREVO_API_KEY', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM'] as const;

describe('MailService delivery', () => {
  const saved: Record<string, string | undefined> = {};
  const realFetch = global.fetch;
  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    global.fetch = realFetch;
  });

  it('sends through Brevo over HTTPS in the background, with the parsed sender', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.MAIL_FROM = 'Parvsetu <no-reply@parvsetu.app>';
    let release!: () => void;
    const calls: [string, RequestInit][] = [];
    global.fetch = jest.fn((url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Promise<Response>((r) => { release = () => r(new Response('{}', { status: 201 })); });
    }) as unknown as typeof fetch;
    const m = new MailService();
    expect(m.mode).toBe('brevo');
    const t = Date.now();
    await m.send(mail); // must not wait for the (still pending) HTTP call
    expect(Date.now() - t).toBeLessThan(100);
    expect(calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email');
    expect((calls[0][1].headers as Record<string, string>)['api-key']).toBe('xkeysib-test');
    expect(JSON.parse(calls[0][1].body as string)).toMatchObject({ sender: { name: 'Parvsetu', email: 'no-reply@parvsetu.app' }, to: [{ email: 'a@b.dev' }], subject: mail.subject });
    release();
    await m.flush();
  });

  it('uses Resend when that key is set, and logs (never throws) an API error', async () => {
    process.env.RESEND_API_KEY = 're_test';
    global.fetch = jest.fn(async () => new Response('bad key', { status: 401 })) as unknown as typeof fetch;
    const m = new MailService();
    expect(m.mode).toBe('resend');
    const err = jest.spyOn((m as unknown as { logger: { error: (s: string) => void } }).logger, 'error').mockImplementation(() => undefined);
    await m.send(mail);
    await m.flush();
    expect(err).toHaveBeenCalledWith(expect.stringContaining('resend API 401'));
  });

  it('never blocks the caller on an unreachable SMTP server', async () => {
    process.env.SMTP_HOST = 'smtp.example.invalid';
    process.env.SMTP_PORT = '587';
    const m = new MailService();
    expect(m.mode).toBe('smtp');
    // What a blocked SMTP port looks like from the app: the connection never completes.
    (m as unknown as { transporter: { sendMail: () => Promise<void> } }).transporter.sendMail = () => new Promise(() => undefined);
    jest.spyOn((m as unknown as { logger: { error: (s: string) => void } }).logger, 'error').mockImplementation(() => undefined);
    const t = Date.now();
    await m.send(mail);
    expect(Date.now() - t).toBeLessThan(200);
  });

  it('memory mode keeps the outbox synchronous (tests rely on it)', async () => {
    process.env.MAIL_TRANSPORT = 'memory';
    process.env.BREVO_API_KEY = 'ignored-in-tests';
    const m = new MailService();
    await m.send(mail);
    expect(m.outbox).toHaveLength(1);
  });
});
