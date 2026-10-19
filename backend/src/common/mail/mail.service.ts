import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { siteUrl } from '../site-url';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Email delivery.
 *   SMTP_HOST set        → real SMTP (e.g. Gmail with an app password, Brevo, SES)
 *   MAIL_TRANSPORT=memory → kept in `outbox` (tests read OTPs from it)
 *   otherwise            → logged to the server console (local development)
 * Sending is best-effort: a mail failure is logged, never shown to the caller,
 * so responses can't be used to probe which addresses exist.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  readonly outbox: OutgoingMail[] = [];

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
  }

  get mode(): 'smtp' | 'memory' | 'log' {
    return this.transporter ? 'smtp' : process.env.MAIL_TRANSPORT === 'memory' ? 'memory' : 'log';
  }

  async send(mail: OutgoingMail): Promise<void> {
    if (this.mode === 'memory') {
      this.outbox.push(mail);
      return;
    }
    if (!this.transporter) {
      this.logger.warn(`[mail not configured] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_USER, ...mail });
    } catch (err) {
      this.logger.error(`Mail to ${mail.to} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * One-time-code email. Built for phones:
 * - the code is in the subject and the hidden preview line, so it can be read
 *   from the notification without opening the mail;
 * - a big, spaced code box (long-press to copy — email clients can't run a copy button);
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
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
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
  </td></tr>
  <tr><td style="padding:16px 24px" align="center">
    <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:#c2410c;background:#fff7ed;border:2px dashed #fdba74;border-radius:14px;padding:18px 12px 18px 22px;user-select:all;-webkit-user-select:all">${spaced}</div>
    <p style="margin:8px 0 0;font-size:12px;color:#64748b">Press and hold the code to copy it</p>
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
