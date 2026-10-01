import { HttpException, Injectable } from '@nestjs/common';
import { OtpPurpose, Prisma } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService, otpEmail } from '../../common/mail/mail.service';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_S = 60;
export const OTP_MAX_PER_HOUR = 5;

/**
 * Email one-time codes. A code is 6 random digits (crypto.randomInt); only an
 * HMAC(JWT_SECRET, userId|purpose|code) is stored. Issuing a new code
 * supersedes older ones; 5 wrong attempts consume the code.
 */
@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private hash(userId: string, purpose: OtpPurpose, code: string) {
    return createHmac('sha256', process.env.JWT_SECRET ?? 'dev').update(`${userId}|${purpose}|${code}`).digest('hex');
  }

  /** Sends a fresh code. Throws 429 inside the cooldown / hourly cap (callers decide whether to surface it). */
  async issue(user: { id: string; name: string; email: string }, purpose: OtpPurpose) {
    const now = Date.now();
    const recent = await this.prisma.emailOtp.findMany({
      where: { userId: user.id, purpose, createdAt: { gt: new Date(now - 3600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < OTP_RESEND_COOLDOWN_S * 1000) {
      const wait = Math.ceil(OTP_RESEND_COOLDOWN_S - (now - recent[0].createdAt.getTime()) / 1000);
      throw new HttpException({ statusCode: 429, message: `Please wait ${wait} seconds before requesting another code.`, code: 'OTP_COOLDOWN', retryAfter: wait }, 429);
    }
    if (recent.length >= OTP_MAX_PER_HOUR) {
      throw new HttpException({ statusCode: 429, message: 'Too many codes requested. Try again in an hour.', code: 'OTP_LIMIT' }, 429);
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.$transaction([
      this.prisma.emailOtp.updateMany({ where: { userId: user.id, purpose, consumedAt: null }, data: { consumedAt: new Date() } }),
      this.prisma.emailOtp.create({
        data: { userId: user.id, purpose, codeHash: this.hash(user.id, purpose, code), sentTo: user.email, expiresAt: new Date(now + OTP_TTL_MINUTES * 60_000) },
      }),
    ]);
    await this.mail.send({ to: user.email, ...otpEmail(purpose === 'VERIFY_EMAIL' ? 'verify' : 'reset', user.name, code, OTP_TTL_MINUTES) });
  }

  /** Consumes the latest live code if it matches; false otherwise (and counts the attempt). */
  async consume(tx: Prisma.TransactionClient, userId: string, purpose: OtpPurpose, code: string): Promise<boolean> {
    const otp = await tx.emailOtp.findFirst({
      where: { userId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return false;
    const a = Buffer.from(otp.codeHash);
    const b = Buffer.from(this.hash(userId, purpose, code));
    if (a.length === b.length && timingSafeEqual(a, b)) {
      // Conditional update: two simultaneous correct submissions can't both win.
      const won = await tx.emailOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } });
      return won.count === 1;
    }
    const attempts = otp.attempts + 1;
    await tx.emailOtp.update({
      where: { id: otp.id },
      data: { attempts, consumedAt: attempts >= OTP_MAX_ATTEMPTS ? new Date() : undefined },
    });
    return false;
  }
}

export function maskEmail(email: string) {
  const [u, d] = email.split('@');
  return `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}`;
}
