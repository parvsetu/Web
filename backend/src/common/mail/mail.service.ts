import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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

/** Branded OTP email (inline styles — email clients ignore stylesheets). */
export function otpEmail(kind: 'verify' | 'reset', name: string, code: string, minutes: number): Omit<OutgoingMail, 'to'> {
  const title = kind === 'verify' ? 'Verify your email' : 'Reset your password';
  const intro = kind === 'verify'
    ? 'Use this code to verify your email and activate your Parvsetu account.'
    : 'Use this code to set a new password for your Parvsetu account.';
  const text = `${title}\n\nNamaste ${name},\n\n${intro}\n\nYour code: ${code}\n\nIt expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email — nobody can use the code without access to your inbox.\n\n— Parvsetu`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #fed7aa;border-radius:16px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#f59e0b,#f97316,#e11d48);color:#fff;padding:20px 24px;font-size:20px;font-weight:bold">🪔 Parvsetu</div>
  <div style="padding:24px;color:#0f172a">
    <h2 style="margin:0 0 8px">${title}</h2>
    <p>Namaste ${escapeHtml(name)},</p><p>${intro}</p>
    <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;background:#fff7ed;border-radius:12px;padding:16px;color:#c2410c">${code}</p>
    <p style="color:#64748b;font-size:13px">This code expires in ${minutes} minutes. If you didn't ask for it, ignore this email.</p>
  </div></div>`;
  return { subject: `${code} is your Parvsetu ${kind === 'verify' ? 'verification' : 'password reset'} code`, text, html };
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
