import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma, ScanMethod, ScanResult, TokenStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessService } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { QrSigner } from '../../common/qr/qr-signer';
import { ScanDto } from './tokens.dto';

export const SCAN_MESSAGES: Record<ScanResult, string> = {
  SUCCESS: 'Token verified successfully. Entry allowed.',
  ALREADY_USED: 'This token has already been used.',
  EXPIRED: 'This token has expired.',
  NOT_YET_VALID: 'This token is not valid yet.',
  CANCELLED: 'This token has been cancelled.',
  WRONG_EVENT: 'This token is not valid for this event.',
  INVALID: 'The QR token could not be verified.',
  UNAUTHORIZED: 'You are not authorized to scan tokens for this event.',
};

export interface ScanResponse {
  success: boolean;
  result: ScanResult;
  status: TokenStatus | 'EXPIRED' | null;
  message: string;
  tokenCode: string | null;
  usedAt: string | null;
  scannedBy: { id: string; name: string } | null;
  validFrom: string | null;
  validUntil: string | null;
  visitorCount: number | null;
  timeSlot: { label: string } | null;
  scannedAt: string;
  replayed: boolean;
}

export interface ScanOutcome {
  httpStatus: number;
  body: ScanResponse;
}

interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

const TOKEN_FOR_SCAN = {
  id: true, eventId: true, tokenCode: true, status: true, validFrom: true, validUntil: true,
  visitorCount: true, usedAt: true,
  usedBy: { select: { id: true, name: true } },
  timeSlot: { select: { label: true } },
} as const;

type ScanToken = Prisma.TokenGetPayload<{ select: typeof TOKEN_FOR_SCAN }>;

/**
 * Gate verification. The guarantee: one token → at most one SUCCESS, ever.
 *
 * 1. The redemption is a single conditional UPDATE
 *      UPDATE tokens SET status='USED' … WHERE id=? AND event=? AND status='ACTIVE'
 *        AND validFrom <= now AND validUntil > now
 *    Postgres row-locks the token; a concurrent second UPDATE waits, then
 *    re-evaluates the WHERE against the committed row (status now USED) and
 *    matches 0 rows. Exactly one caller sees count = 1. There is no
 *    read-then-write window.
 * 2. Backstop: partial unique index `scan_logs_one_success_per_token` — a
 *    second non-voided SUCCESS row for a token cannot exist. The SUCCESS log
 *    is written in the same transaction as the UPDATE, so if that index ever
 *    fired, the redemption would roll back too.
 * 3. Retries: (userId, idempotencyKey) is unique on scan_logs. A retried
 *    request replays the stored verdict instead of scanning again.
 *
 * The scanner's identity comes only from the JWT; eventId from the client is
 * treated as a claim and checked against the user's server-side permissions.
 */
@Injectable()
export class ScanService {
  private readonly logger = new Logger(ScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly qr: QrSigner,
  ) {}

  async scan(user: RequestUser, dto: ScanDto, meta: RequestMeta): Promise<ScanOutcome> {
    if (!!dto.qrPayload === !!dto.tokenCode) {
      throw new BadRequestException('Send exactly one of qrPayload or tokenCode');
    }
    const method: ScanMethod = dto.qrPayload ? 'QR' : 'MANUAL';
    const key = dto.idempotencyKey ?? null;
    const requestHash = fingerprint(dto);

    if (key) {
      const replay = await this.replay(user.id, key, requestHash);
      if (replay) return replay;
    }

    try {
      return await this.scanOnce(user, dto, method, key, requestHash, meta);
    } catch (err) {
      // Same idempotency key raced in from a retry, or (theoretically) the
      // one-success index fired: the stored verdict is the answer.
      if (isUniqueViolation(err)) {
        const replay = key ? await this.replay(user.id, key, requestHash) : null;
        if (replay) return replay;
        this.logger.warn(`Duplicate-success backstop fired for event ${dto.eventId}`);
        return this.scanOnce(user, dto, method, null, requestHash, meta);
      }
      throw err;
    }
  }

  private async scanOnce(
    user: RequestUser, dto: ScanDto, method: ScanMethod, key: string | null, requestHash: string, meta: RequestMeta,
  ): Promise<ScanOutcome> {
    const now = new Date();
    const base = { userId: user.id, method, idempotencyKey: key, requestHash, ipAddress: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, scanTime: now };

    // Steps 1-3: authenticated (JWT guard), TOKEN_SCAN on this event, event open.
    const ctx = await this.access.eventAccess(user, dto.eventId);
    const eventId = ctx?.event?.id ?? null;
    if (!ctx || !ctx.perms.has('TOKEN_SCAN')) {
      return this.deny(base, eventId, null, 'UNAUTHORIZED', 'no TOKEN_SCAN permission for event', 403, now);
    }
    if (method === 'MANUAL' && !ctx.perms.has('TOKEN_MANUAL_ENTRY')) {
      return this.deny(base, eventId, null, 'UNAUTHORIZED', 'no TOKEN_MANUAL_ENTRY permission', 403, now);
    }
    if (ctx.event!.approvalStatus !== 'LIVE') {
      return this.deny(base, eventId, null, 'UNAUTHORIZED', `event approval is ${ctx.event!.approvalStatus}`, 403, now,
        'Scanning is closed: this festival is not live yet (platform review and registration fee pending).');
    }
    if (ctx.event!.status !== 'ACTIVE') {
      return this.deny(base, eventId, null, 'UNAUTHORIZED', `event is ${ctx.event!.status}`, 403, now,
        'Scanning is closed: this event is not active.');
    }

    // Step 4: token exists (signature checked before any DB lookup for QR).
    let token: ScanToken | null = null;
    if (method === 'QR') {
      const secureToken = this.qr.verify(dto.qrPayload!);
      if (!secureToken) return this.deny(base, eventId, null, 'INVALID', 'bad QR signature/format', 200, now);
      token = await this.prisma.token.findUnique({ where: { secureToken }, select: TOKEN_FOR_SCAN });
    } else {
      token = await this.prisma.token.findUnique({
        where: { eventId_tokenCode: { eventId: eventId!, tokenCode: dto.tokenCode!.trim().toUpperCase() } },
        select: TOKEN_FOR_SCAN,
      });
    }
    if (!token) return this.deny(base, eventId, null, 'INVALID', 'token not found', 200, now);

    // Step 5: belongs to this event. The other event's token id is not linked
    // to this log, so that event's history never shows this scanner.
    if (token.eventId !== eventId) {
      return this.deny(base, eventId, null, 'WRONG_EVENT', 'token belongs to another event', 200, now);
    }

    // Steps 6-11: one atomic statement decides; the log commits with it.
    return this.prisma.$transaction(async (tx) => {
      const redeemed = await tx.token.updateMany({
        where: { id: token!.id, eventId: eventId!, status: 'ACTIVE', validFrom: { lte: now }, validUntil: { gt: now } },
        data: { status: 'USED', usedAt: now, usedById: user.id },
      });

      if (redeemed.count === 1) {
        await tx.scanLog.create({ data: { ...base, eventId, tokenId: token!.id, result: 'SUCCESS' } });
        return {
          httpStatus: 200,
          body: this.body('SUCCESS', {
            status: 'USED', tokenCode: token!.tokenCode, usedAt: now.toISOString(),
            scannedBy: { id: user.id, name: user.name }, visitorCount: token!.visitorCount,
            timeSlot: token!.timeSlot, scannedAt: now,
            validFrom: token!.validFrom, validUntil: token!.validUntil,
          }),
        };
      }

      // Not redeemed: classify from the committed state (read inside the same
      // transaction, after the UPDATE waited out any concurrent redeemer).
      const current = await tx.token.findUniqueOrThrow({ where: { id: token!.id }, select: TOKEN_FOR_SCAN });
      const result = classify(current, now);
      await tx.scanLog.create({
        data: { ...base, eventId, tokenId: current.id, result, failureReason: result === 'INVALID' ? 'state changed during scan' : null },
      });
      return { httpStatus: 200, body: this.verdictBody(result, current, now, false) };
    });
  }

  private async deny(
    base: Omit<Prisma.ScanLogUncheckedCreateInput, 'result'>, eventId: string | null, tokenId: string | null,
    result: ScanResult, failureReason: string, httpStatus: number, now: Date, message?: string,
  ): Promise<ScanOutcome> {
    await this.prisma.scanLog.create({ data: { ...base, eventId, tokenId, result, failureReason } });
    const body = this.body(result, { scannedAt: now });
    if (message) body.message = message;
    return { httpStatus, body };
  }

  /** A previously stored verdict for this (user, idempotencyKey) — only for the identical request. */
  private async replay(userId: string, key: string, requestHash: string): Promise<ScanOutcome | null> {
    const log = await this.prisma.scanLog.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      select: { result: true, scanTime: true, requestHash: true, user: { select: { id: true, name: true } }, token: { select: TOKEN_FOR_SCAN } },
    });
    if (!log) return null;
    if (log.requestHash !== requestHash) {
      // Never hand a stored ENTRY ALLOWED to a different token.
      throw new ConflictException({
        statusCode: 409,
        message: 'This scan ID was already used for a different token. Please scan again.',
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    if (log.result === 'UNAUTHORIZED') {
      return { httpStatus: 403, body: { ...this.body('UNAUTHORIZED', { scannedAt: log.scanTime }), replayed: true } };
    }
    if (!log.token) return { httpStatus: 200, body: { ...this.body(log.result, { scannedAt: log.scanTime }), replayed: true } };
    if (log.result === 'SUCCESS') {
      return {
        httpStatus: 200,
        body: {
          ...this.body('SUCCESS', {
            status: 'USED', tokenCode: log.token.tokenCode, usedAt: log.scanTime.toISOString(), scannedBy: log.user,
            visitorCount: log.token.visitorCount, timeSlot: log.token.timeSlot, scannedAt: log.scanTime,
            validFrom: log.token.validFrom, validUntil: log.token.validUntil,
          }),
          replayed: true,
        },
      };
    }
    return { httpStatus: 200, body: this.verdictBody(log.result, log.token, log.scanTime, true) };
  }

  private verdictBody(result: ScanResult, t: ScanToken, now: Date, replayed: boolean): ScanResponse {
    const status = t.status === 'ACTIVE' && now >= t.validUntil ? 'EXPIRED' : t.status;
    return {
      ...this.body(result, {
        status, tokenCode: t.tokenCode, scannedAt: now,
        usedAt: result === 'ALREADY_USED' ? t.usedAt?.toISOString() ?? null : null,
        scannedBy: result === 'ALREADY_USED' ? t.usedBy : null,
        validFrom: t.validFrom, validUntil: t.validUntil, visitorCount: t.visitorCount, timeSlot: t.timeSlot,
      }),
      replayed,
    };
  }

  private body(result: ScanResult, f: {
    status?: ScanResponse['status']; tokenCode?: string; usedAt?: string | null; scannedBy?: { id: string; name: string } | null;
    validFrom?: Date; validUntil?: Date; visitorCount?: number; timeSlot?: { label: string } | null; scannedAt: Date;
  }): ScanResponse {
    return {
      success: result === 'SUCCESS',
      result,
      status: f.status ?? null,
      message: SCAN_MESSAGES[result],
      tokenCode: f.tokenCode ?? null,
      usedAt: f.usedAt ?? null,
      scannedBy: f.scannedBy ?? null,
      validFrom: f.validFrom?.toISOString() ?? null,
      validUntil: f.validUntil?.toISOString() ?? null,
      visitorCount: f.visitorCount ?? null,
      timeSlot: f.timeSlot ?? null,
      scannedAt: f.scannedAt.toISOString(),
      replayed: false,
    };
  }
}

/**
 * Why a token that wasn't redeemed was refused. USED is reported before the
 * time checks: "already used" is the more useful (and more security-relevant)
 * answer for a token that was used and is now also past its window.
 */
export function classify(t: { status: TokenStatus; validFrom: Date; validUntil: Date }, now: Date): ScanResult {
  if (t.status === 'CANCELLED') return 'CANCELLED';
  if (t.status === 'USED') return 'ALREADY_USED';
  if (now >= t.validUntil) return 'EXPIRED';
  if (now < t.validFrom) return 'NOT_YET_VALID';
  return 'INVALID';
}

function fingerprint(dto: ScanDto) {
  const subject = dto.qrPayload ? `qr:${dto.qrPayload.trim()}` : `code:${(dto.tokenCode ?? '').trim().toUpperCase()}`;
  return createHash('sha256').update(`${dto.eventId}|${subject}`).digest('hex');
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
