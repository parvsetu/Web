import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EventRef } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { QrSigner } from '../../common/qr/qr-signer';
import { normalizeMobile } from '../../common/identity';
import { paged, paging, userRef } from '../../common/http';
import { dayRange, slotWindow, ymd } from '../../common/time/validity';
import { presentToken, tokenSelect } from './token-presenter';
import { BulkGenerateDto, ChangeValidityDto, IssueTokenDto, ReactivateTokenDto, TokenListQuery, ValidityDto } from './tokens.dto';

const MAX_CUSTOM_WINDOW_MS = 31 * 24 * 3600 * 1000;

interface ResolvedValidity {
  validFrom: Date;
  validUntil: Date;
  timeSlotId: string | null;
  capacity: number | null;
}

@Injectable()
export class TokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly qr: QrSigner,
  ) {}

  // ─── Validity ────────────────────────────────────────────────────────

  /**
   * Slot form: the event's daily slot on a calendar date (date must fall
   * within the event). Custom form: an explicit window — needs
   * TOKEN_GENERATE (admin-level), because it bypasses the configured slots.
   */
  private async resolveValidity(
    db: Prisma.TransactionClient | PrismaService,
    event: EventRef,
    dto: ValidityDto,
    perms: Set<string>,
  ): Promise<ResolvedValidity> {
    const slotForm = dto.timeSlotId !== undefined || dto.date !== undefined;
    const customForm = dto.validFrom !== undefined || dto.validUntil !== undefined;
    if (slotForm === customForm) {
      throw new BadRequestException('Provide either timeSlotId + date, or validFrom + validUntil');
    }

    let result: ResolvedValidity;
    if (slotForm) {
      if (!dto.timeSlotId || !dto.date) throw new BadRequestException('timeSlotId and date are both required');
      if (dto.date < ymd(event.startDate) || dto.date > ymd(event.endDate)) {
        throw new BadRequestException(`Date must be between ${ymd(event.startDate)} and ${ymd(event.endDate)}`);
      }
      const slot = await db.timeSlot.findFirst({ where: { id: dto.timeSlotId, eventId: event.id } });
      if (!slot) throw new NotFoundException('Time slot not found');
      if (!slot.isActive) throw new BadRequestException('This time slot is not active');
      result = { ...slotWindow(dto.date, slot.startTime, slot.endTime, event.timezone), timeSlotId: slot.id, capacity: slot.capacity };
    } else {
      if (!perms.has('TOKEN_GENERATE')) {
        throw new ForbiddenException({ statusCode: 403, message: 'Only administrators can set a custom validity window.', code: 'FORBIDDEN' });
      }
      if (!dto.validFrom || !dto.validUntil) throw new BadRequestException('validFrom and validUntil are both required');
      const validFrom = new Date(dto.validFrom);
      const validUntil = new Date(dto.validUntil);
      if (!(validUntil > validFrom)) throw new BadRequestException('validUntil must be after validFrom');
      if (validUntil.getTime() - validFrom.getTime() > MAX_CUSTOM_WINDOW_MS) {
        throw new BadRequestException('A validity window cannot be longer than 31 days');
      }
      result = { validFrom, validUntil, timeSlotId: null, capacity: null };
    }
    if (result.validUntil <= new Date()) throw new BadRequestException('This validity window has already ended');
    return result;
  }

  private assertCanIssue(event: EventRef) {
    if (event.status !== 'DRAFT' && event.status !== 'ACTIVE') {
      throw new ConflictException({ message: `Tokens cannot be issued for a ${event.status.toLowerCase()} event.`, code: 'EVENT_CLOSED' });
    }
  }

  /** Serializes issuance per slot window (row lock on the slot) and enforces capacity. */
  private async checkCapacity(tx: Prisma.TransactionClient, v: ResolvedValidity, adding: number) {
    if (!v.timeSlotId) return;
    await tx.$queryRaw`SELECT id FROM time_slots WHERE id = ${v.timeSlotId} FOR UPDATE`;
    if (v.capacity === null) return;
    const issued = await tx.token.aggregate({
      where: { timeSlotId: v.timeSlotId, validFrom: v.validFrom, status: { not: 'CANCELLED' } },
      _sum: { visitorCount: true },
    });
    const used = issued._sum.visitorCount ?? 0;
    if (used + adding > v.capacity) {
      throw new ConflictException({
        message: `This slot is full (${used}/${v.capacity} visitors already booked).`,
        code: 'SLOT_FULL',
      });
    }
  }

  /** Atomically reserves `n` sequence numbers on the event row. */
  private async reserveSeq(tx: Prisma.TransactionClient, eventId: string, n: number): Promise<number> {
    const rows = await tx.$queryRaw<{ tokenSeq: number }[]>`
      UPDATE events SET "tokenSeq" = "tokenSeq" + ${n} WHERE id = ${eventId} RETURNING "tokenSeq"`;
    return rows[0].tokenSeq - n + 1;
  }

  private code(event: EventRef, seq: number) {
    return `${event.tokenPrefix}-${event.startDate.getUTCFullYear()}-${String(seq).padStart(6, '0')}`;
  }

  private visitorCount(event: EventRef, requested?: number) {
    const n = requested ?? 1;
    if (n > event.maxVisitorsPerToken) {
      throw new BadRequestException(`A token can admit at most ${event.maxVisitorsPerToken} visitors for this event`);
    }
    return n;
  }

  // ─── Issue ───────────────────────────────────────────────────────────

  async issue(actor: RequestUser, event: EventRef, perms: Set<string>, dto: IssueTokenDto) {
    this.assertCanIssue(event);
    const visitorCount = this.visitorCount(event, dto.visitorCount);
    const mobile = dto.visitorMobile ? normalizeMobile(dto.visitorMobile) : null;

    const id = await this.prisma.$transaction(async (tx) => {
      const v = await this.resolveValidity(tx, event, dto, perms);
      await this.checkCapacity(tx, v, visitorCount);
      const seq = await this.reserveSeq(tx, event.id, 1);
      const visitor = dto.visitorName || mobile
        ? await tx.visitor.create({ data: { eventId: event.id, name: dto.visitorName?.trim() ?? null, mobile } })
        : null;
      const token = await tx.token.create({
        data: {
          eventId: event.id, tokenCode: this.code(event, seq), secureToken: this.qr.newSecureToken(),
          visitorId: visitor?.id ?? null, timeSlotId: v.timeSlotId, visitorCount,
          validFrom: v.validFrom, validUntil: v.validUntil, issuedById: actor.id,
        },
      });
      return token.id;
    });
    return this.getWithQr(event.id, id);
  }

  async bulkGenerate(actor: RequestUser, event: EventRef, perms: Set<string>, dto: BulkGenerateDto) {
    this.assertCanIssue(event);
    const visitorCount = this.visitorCount(event, dto.visitorCount);

    const ids = await this.prisma.$transaction(async (tx) => {
      const v = await this.resolveValidity(tx, event, dto, perms);
      await this.checkCapacity(tx, v, visitorCount * dto.count);
      const first = await this.reserveSeq(tx, event.id, dto.count);
      const rows = Array.from({ length: dto.count }, (_, i) => ({
        id: randomUUID(), eventId: event.id, tokenCode: this.code(event, first + i), secureToken: this.qr.newSecureToken(),
        timeSlotId: v.timeSlotId, visitorCount, validFrom: v.validFrom, validUntil: v.validUntil, issuedById: actor.id,
      }));
      await tx.token.createMany({ data: rows });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'token.bulk_generated',
        entityType: 'Token', after: { count: dto.count, from: rows[0].tokenCode, to: rows[rows.length - 1].tokenCode, validFrom: v.validFrom, validUntil: v.validUntil, timeSlotId: v.timeSlotId },
      }, tx);
      return rows.map((r) => r.id);
    }, { timeout: 30_000 });

    const tokens = await this.prisma.token.findMany({ where: { id: { in: ids } }, select: tokenSelect, orderBy: { tokenCode: 'asc' } });
    return { count: tokens.length, tokens: tokens.map((t) => presentToken(t, this.qr.payloadFor(t.secureToken))) };
  }

  // ─── Read ────────────────────────────────────────────────────────────

  async list(event: EventRef, q: TokenListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const now = new Date();
    const where: Prisma.TokenWhereInput = { eventId: event.id };
    switch (q.status) {
      case 'USED': where.status = 'USED'; break;
      case 'CANCELLED': where.status = 'CANCELLED'; break;
      case 'ACTIVE': Object.assign(where, { status: 'ACTIVE', validFrom: { lte: now }, validUntil: { gt: now } }); break;
      case 'NOT_YET_VALID': Object.assign(where, { status: 'ACTIVE', validFrom: { gt: now } }); break;
      case 'EXPIRED': Object.assign(where, { status: 'ACTIVE', validUntil: { lte: now } }); break;
    }
    if (q.timeSlotId) where.timeSlotId = q.timeSlotId;
    if (q.date) {
      const r = dayRange(q.date, q.date, event.timezone);
      where.validFrom = { ...(where.validFrom as object), gte: r.gte, lt: r.lt };
    }
    if (q.q) {
      const term = q.q.trim();
      where.OR = [
        { tokenCode: { contains: term, mode: 'insensitive' } },
        { visitor: { name: { contains: term, mode: 'insensitive' } } },
        { visitor: { mobile: { contains: term } } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.token.findMany({ where, select: tokenSelect, orderBy: { issuedAt: 'desc' }, skip, take }),
      this.prisma.token.count({ where }),
    ]);
    return paged(items.map((t) => presentToken(t)), total, page, pageSize);
  }

  async getWithQr(eventId: string, tokenId: string) {
    const t = await this.prisma.token.findFirst({ where: { id: tokenId, eventId }, select: tokenSelect });
    if (!t) throw new NotFoundException('Token not found');
    return presentToken(t, this.qr.payloadFor(t.secureToken));
  }

  async detail(eventId: string, tokenId: string) {
    const token = await this.getWithQr(eventId, tokenId);
    const scans = await this.prisma.scanLog.findMany({
      where: { tokenId, eventId },
      orderBy: { scanTime: 'desc' },
      take: 100,
      select: { id: true, scanTime: true, result: true, method: true, failureReason: true, voidedAt: true, user: userRef },
    });
    return {
      ...token,
      scans: scans.map(({ voidedAt, ...s }) => ({ ...s, tokenCode: token.tokenCode, voided: voidedAt !== null })),
    };
  }

  async qrPng(eventId: string, tokenId: string): Promise<Buffer> {
    const t = await this.prisma.token.findFirst({ where: { id: tokenId, eventId }, select: { secureToken: true } });
    if (!t) throw new NotFoundException('Token not found');
    return QRCode.toBuffer(this.qr.payloadFor(t.secureToken), { errorCorrectionLevel: 'M', margin: 2, width: 512 });
  }

  // ─── Administrative state changes (all audited, all conditional updates) ──

  async cancel(actor: RequestUser, event: EventRef, tokenId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.token.findFirst({ where: { id: tokenId, eventId: event.id } });
      if (!before) throw new NotFoundException('Token not found');
      const now = new Date();
      const res = await tx.token.updateMany({
        where: { id: tokenId, eventId: event.id, status: 'ACTIVE' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledById: actor.id, cancellationReason: reason },
      });
      if (res.count !== 1) {
        throw new ConflictException({ message: `Only an unused active token can be cancelled (this one is ${before.status.toLowerCase()}).`, code: 'TOKEN_NOT_ACTIVE' });
      }
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'token.cancelled',
        entityType: 'Token', entityId: tokenId, before: { status: before.status }, after: { status: 'CANCELLED' }, reason,
      }, tx);
    });
    return this.getWithQr(event.id, tokenId);
  }

  async changeValidity(actor: RequestUser, event: EventRef, perms: Set<string>, tokenId: string, dto: ChangeValidityDto) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.token.findFirst({ where: { id: tokenId, eventId: event.id } });
      if (!before) throw new NotFoundException('Token not found');
      const v = await this.resolveValidity(tx, event, dto, perms);
      const res = await tx.token.updateMany({
        where: { id: tokenId, eventId: event.id, status: 'ACTIVE' },
        data: { validFrom: v.validFrom, validUntil: v.validUntil, timeSlotId: v.timeSlotId },
      });
      if (res.count !== 1) {
        throw new ConflictException({ message: 'Validity can only be changed on an unused, uncancelled token.', code: 'TOKEN_NOT_ACTIVE' });
      }
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'token.validity_changed',
        entityType: 'Token', entityId: tokenId,
        before: { validFrom: before.validFrom, validUntil: before.validUntil, timeSlotId: before.timeSlotId },
        after: { validFrom: v.validFrom, validUntil: v.validUntil, timeSlotId: v.timeSlotId },
        reason: dto.reason,
      }, tx);
    });
    return this.getWithQr(event.id, tokenId);
  }

  /**
   * Administrative recovery: USED → ACTIVE. Never reachable from the scan
   * API. Requires TOKEN_REACTIVATE, a reason, and typing the token code back
   * as confirmation. The original SUCCESS scan is kept but marked voided (so
   * the one-success-per-token index allows exactly one new entry), and the
   * whole thing is audited.
   */
  async reactivate(actor: RequestUser, event: EventRef, tokenId: string, dto: ReactivateTokenDto) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.token.findFirst({ where: { id: tokenId, eventId: event.id } });
      if (!before) throw new NotFoundException('Token not found');
      if (dto.confirmTokenCode.trim().toUpperCase() !== before.tokenCode) {
        throw new BadRequestException({ message: 'The confirmation code does not match this token.', code: 'CONFIRMATION_MISMATCH' });
      }
      const res = await tx.token.updateMany({
        where: { id: tokenId, eventId: event.id, status: 'USED' },
        data: { status: 'ACTIVE', usedAt: null, usedById: null },
      });
      if (res.count !== 1) {
        throw new ConflictException({ message: 'Only a used token can be reactivated.', code: 'TOKEN_NOT_USED' });
      }
      const now = new Date();
      await tx.scanLog.updateMany({
        where: { tokenId, result: 'SUCCESS', voidedAt: null },
        data: { voidedAt: now, voidReason: dto.reason },
      });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'token.reactivated',
        entityType: 'Token', entityId: tokenId,
        before: { status: 'USED', usedAt: before.usedAt, usedById: before.usedById },
        after: { status: 'ACTIVE' },
        reason: dto.reason,
      }, tx);
    });
    return this.getWithQr(event.id, tokenId);
  }
}
