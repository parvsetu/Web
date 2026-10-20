import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { siteUrl } from '../site-url';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Email delivery. Transport, first match wins:
 *   MAIL_TRANSPORT=memory → kept in `outbox` (tests read OTPs from it)
 *   MAIL_RELAY_URL        → POST to the frontend's /api/mail on Vercel, which
 *                           sends over SMTP (Gmail app password) — free
 *   BREVO_API_KEY         → Brevo transactional API over HTTPS
 *   RESEND_API_KEY        → Resend API over HTTPS
 *   SMTP_HOST             → SMTP (Gmail app password, Brevo/SES relay…)
 *   otherwise             → logged to the server console (local development)
 * HTTPS APIs exist because hosts like Render's free plan block outgoing SMTP
 * ports (25/465/587) — Gmail included: SMTP then hangs until the connection timeout and nothing
 * is delivered.
 *
 * Sending never holds up the request: real deliveries run in the background
 * with short timeouts, and a failure is only logged — never shown to the
 * caller, so responses can't be used to probe which addresses exist.
 */
const SEND_TIMEOUT_MS = 15_000;

/** "Parvsetu <no-reply@x.org>" → { name, email }. */
function parseFrom(raw: string | undefined): { name: string; email: string } | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const m = /^(.*?)\s*<([^>]+)>$/.exec(v);
  return m ? { name: m[1].replace(/^"|"$/g, '').trim() || 'Parvsetu', email: m[2].trim() } : { name: 'Parvsetu', email: v };
}

@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  readonly outbox: OutgoingMail[] = [];
  /** Deliveries still running (tests / shutdown can wait for them). */
  private readonly inFlight = new Set<Promise<void>>();

  constructor() {
    if (process.env.SMTP_HOST && !this.httpProvider) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        // Defaults are 2 min / 30 s / 10 min — a blocked port would hang that long.
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      });
    }
  }

  private get httpProvider(): 'relay' | 'brevo' | 'resend' | null {
    if (process.env.MAIL_RELAY_URL) return 'relay';
    return process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : null;
  }

  get mode(): 'smtp' | 'memory' | 'log' | 'relay' | 'brevo' | 'resend' {
    if (process.env.MAIL_TRANSPORT === 'memory') return 'memory';
    return this.httpProvider ?? (this.transporter ? 'smtp' : 'log');
  }

  /** Queues the email and returns at once; delivery happens in the background. */
  async send(mail: OutgoingMail): Promise<void> {
    const mode = this.mode;
    if (mode === 'memory') {
      this.outbox.push(mail);
      return;
    }
    if (mode === 'log') {
      this.logger.warn(`[mail not configured] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    const job = this.deliver(mode, mail)
      .catch((err) => this.logger.error(`Mail (${mode}) to ${mail.to} failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  /** Waits for background deliveries (used on shutdown and in tests). */
  async flush() {
    await Promise.allSettled([...this.inFlight]);
  }

  private async deliver(mode: 'smtp' | 'relay' | 'brevo' | 'resend', mail: OutgoingMail) {
    const from = parseFrom(process.env.MAIL_FROM) ?? parseFrom(process.env.SMTP_USER) ?? { name: 'Parvsetu', email: 'no-reply@parvsetu.app' };
    if (mode === 'smtp') {
      await this.transporter!.sendMail({ from: `${from.name} <${from.email}>`, ...mail });
      return;
    }
    const req: { url: string; headers: Record<string, string>; body: unknown } = mode === 'relay'
      ? {
        // The relay sends as its own MAIL_FROM; only the message travels.
        url: process.env.MAIL_RELAY_URL!,
        headers: { authorization: `Bearer ${process.env.MAIL_RELAY_SECRET ?? ''}` },
        body: mail,
      }
      : mode === 'brevo'
      ? {
        url: 'https://api.brevo.com/v3/smtp/email',
        headers: { 'api-key': process.env.BREVO_API_KEY! },
        body: { sender: from, to: [{ email: mail.to }], subject: mail.subject, htmlContent: mail.html, textContent: mail.text },
      }
      : {
        url: 'https://api.resend.com/emails',
        headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
        body: { from: `${from.name} <${from.email}>`, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text },
      };
    const res = await fetch(req.url, {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...req.headers },
      body: JSON.stringify(req.body), signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${mode} API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  async onModuleDestroy() {
    await this.flush();
  }
}

/**
 * One-time-code email. Built for phones:
 * - the code is in the subject and the hidden preview line, so it can be read
 *   from the notification without opening the mail;
 * - a big code box (tap / long-press selects it all — email clients can't run a copy button).
 *   The digits are one unbroken string (spacing is letter-spacing only) and a plain
 *   "Your … code is 123456" sentence is present, so Gmail's own "Copy code" detection
 *   can find it — a space inside the code defeats that;
 * - "Verify automatically" opens Parvsetu with the code already filled in. The code
 *   rides in the URL fragment (#code=…), which browsers never send to a server, so
 *   it doesn't end up in any request log; the person still taps Verify / sets a password.
 * Table layout + inline styles: email clients ignore stylesheets and flexbox.
 */
export function otpEmail(
  kind: 'verify' | 'reset', name: string, code: string, minutes: number,
  opts: { email?: string | null; requestedAt?: Date } = {},
): Omit<OutgoingMail, 'to'> {
  const verify = kind === 'verify';
  const title = verify ? 'Verify your email' : 'Reset your password';
  const intro = verify
    ? 'Enter this code to verify your email and activate your Parvsetu account.'
    : 'Enter this code to set a new password for your Parvsetu account.';
  const base = siteUrl();
  const link = opts.email
    ? verify
      ? `${base}/verify-email?email=${encodeURIComponent(opts.email)}#code=${code}`
      : `${base}/forgot-password?identifier=${encodeURIComponent(opts.email)}#code=${code}`
    : null;
  const cta = verify ? 'Verify automatically' : 'Set a new password';
  const when = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(opts.requestedAt ?? new Date());
  const warning = 'Never share this code. Parvsetu staff will never ask you for it.';
  const text = [
    title, '', `Namaste ${name},`, '', intro, '', `Your code: ${code}`, '',
    ...(link ? [`${cta}: ${link}`, ''] : []),
    `It expires in ${minutes} minutes (requested ${when} IST). ${warning}`,
    'Didn’t ask for this? You can ignore this email — nobody can use the code without access to your inbox.', '', '— Parvsetu',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#fff7ed">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Your Parvsetu code is ${code} — expires in ${minutes} minutes.&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #fed7aa;border-radius:18px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <tr><td style="background:linear-gradient(135deg,#f59e0b,#f97316,#e11d48);background-color:#f97316;color:#ffffff;padding:18px 24px;font-size:20px;font-weight:bold">🪔 Parvsetu</td></tr>
  <tr><td style="padding:24px 24px 8px">
    <h1 style="margin:0 0 6px;font-size:22px">${title}</h1>
    <p style="margin:0 0 4px">Namaste ${escapeHtml(name)},</p>
    <p style="margin:0;color:#334155">${intro}</p>
    <p style="margin:10px 0 0;color:#334155">Your ${verify ? 'verification' : 'password reset'} code is <b>${code}</b></p>
  </td></tr>
  <tr><td style="padding:16px 24px" align="center">
    <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:#c2410c;background:#fff7ed;border:2px dashed #fdba74;border-radius:14px;padding:18px 12px 18px 22px;user-select:all;-webkit-user-select:all">${code}</div>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b">Tap or press and hold the code to copy it</p>
  </td></tr>
  ${link ? `<tr><td style="padding:4px 24px 8px" align="center">
    <a href="${escapeHtml(link)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:12px">${cta} →</a>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b">Opens Parvsetu with the code already filled in.</p>
  </td></tr>` : ''}
  <tr><td style="padding:16px 24px 24px">
    <p style="margin:0 0 6px;font-size:13px;color:#475569">⏱ Expires in <b>${minutes} minutes</b> · requested ${when} IST</p>
    <p style="margin:0 0 6px;font-size:13px;color:#b91c1c">🔒 ${warning}</p>
    <p style="margin:0;font-size:12px;color:#94a3b8">Didn’t ask for this? Ignore this email — nobody can use the code without access to your inbox.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
  return { subject: `${code} is your Parvsetu ${verify ? 'verification' : 'password reset'} code`, text, html };
}

/** Branded transactional email: title, greeting, paragraphs and an optional button. */
export function brandedEmail(opts: { subject: string; title: string; name: string; paragraphs: string[]; cta?: { label: string; url: string }; footer?: string }): Omit<OutgoingMail, 'to'> {
  const text = [opts.title, '', `Namaste ${opts.name},`, '', ...opts.paragraphs.flatMap((p) => [p, '']), ...(opts.cta ? [`${opts.cta.label}: ${opts.cta.url}`, ''] : []), opts.footer ?? '', '— Parvsetu'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #fed7aa;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#f59e0b,#f97316,#e11d48);color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">🪔 Parvsetu</div>
  <div style="padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px">${escapeHtml(opts.title)}</h2>
    <p>Namaste ${escapeHtml(opts.name)},</p>
    ${opts.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}
    ${opts.cta ? `<p style="text-align:center;margin:24px 0"><a href="${escapeHtml(opts.cta.url)}" style="background:#ea580c;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:bold">${escapeHtml(opts.cta.label)}</a></p><p style="color:#64748b;font-size:12px;word-break:break-all">${escapeHtml(opts.cta.url)}</p>` : ''}
    ${opts.footer ? `<p style="color:#64748b;font-size:13px">${escapeHtml(opts.footer)}</p>` : ''}
  </div></div>`;
  return { subject: opts.subject, text, html };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
