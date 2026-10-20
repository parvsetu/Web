import { timingSafeEqual } from 'crypto';
import nodemailer from 'nodemailer';

/**
 * Mail relay for the API. Render's free plan blocks outgoing SMTP ports, Vercel
 * doesn't — so the API POSTs each email here (MAIL_RELAY_URL + MAIL_RELAY_SECRET
 * on the backend) and this sends it over SMTP (e.g. a Gmail app password).
 * Only the backend holds the secret; the sender is always MAIL_FROM, never the caller's.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, MAIL_RELAY_SECRET } = process.env;
const port = Number(SMTP_PORT ?? 587);
const transporter = SMTP_HOST
  ? nodemailer.createTransport({
    host: SMTP_HOST, port, secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  })
  : null;

function authorised(header: string | null): boolean {
  if (!MAIL_RELAY_SECRET || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(MAIL_RELAY_SECRET);
  return given.length === want.length && timingSafeEqual(given, want);
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

export async function POST(req: Request) {
  if (!authorised(req.headers.get('authorization'))) return Response.json({ error: 'unauthorised' }, { status: 401 });
  if (!transporter) return Response.json({ error: 'SMTP is not configured on the relay' }, { status: 503 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { to, subject, text, html } = body ?? {};
  if (!isText(to, 320) || !/^[^\s@,<>]+@[^\s@,<>]+$/.test(to) || !isText(subject, 500) || !isText(text, 200_000) || !isText(html, 500_000)) {
    return Response.json({ error: 'to, subject, text and html are required' }, { status: 400 });
  }
  try {
    await transporter.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, text, html });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: `SMTP: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }
}
