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
import { BillingService } from '../billing/billing.service';
import { PartnerBillingService } from '../partners/partner-billing.service';
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
    private readonly billing: BillingService,
    private readonly partners: PartnerBillingService,
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
    const durationForm = dto.durationHours !== undefined || dto.startAt !== undefined;
    if ([slotForm, customForm, durationForm].filter(Boolean).length !== 1) {
      throw new BadRequestException('Provide exactly one of: timeSlotId + date, validFrom + validUntil, or durationHours');
    }

    let result: ResolvedValidity;
    if (durationForm) {
      if (!dto.durationHours) throw new BadRequestException('durationHours is required');
      const options = await db.event.findUniqueOrThrow({ where: { id: event.id }, select: { tokenDurationOptions: true } });
      if (!perms.has('TOKEN_GENERATE') && !options.tokenDurationOptions.includes(dto.durationHours)) {
        throw new ForbiddenException({
          statusCode: 403, code: 'FORBIDDEN',
          message: options.tokenDurationOptions.length
            ? `Allowed durations: ${options.tokenDurationOptions.join(', ')} hours.`
            : 'Duration passes are not enabled for this festival.',
        });
      }
      const validFrom = dto.startAt ? new Date(dto.startAt) : new Date();
      if (validFrom.getTime() < Date.now() - 10 * 60_000) throw new BadRequestException('Start time cannot be in the past');
      result = { validFrom, validUntil: new Date(validFrom.getTime() + dto.durationHours * 3600_000), timeSlotId: null, capacity: null };
    } else if (slotForm) {
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
    await this.checkSlotCapacity(tx, v.timeSlotId, v.validFrom, v.capacity, adding);
  }

  /**
   * Locks the slot row (serializing every issuer: desk, bulk, online orders)
   * and refuses if issued tokens + unexpired unpaid online orders + `adding`
   * would exceed capacity. `excludeOrderId` lets an order that already holds
   * capacity convert its own hold into a token.
   */
  async checkSlotCapacity(
    tx: Prisma.TransactionClient, timeSlotId: string, validFrom: Date, capacity: number | null, adding: number, excludeOrderId?: string,
  ) {
    await tx.$queryRaw`SELECT id FROM time_slots WHERE id = ${timeSlotId} FOR UPDATE`;
    if (capacity === null) return;
    const [issued, held] = await Promise.all([
      tx.token.aggregate({
        where: { timeSlotId, validFrom, status: { not: 'CANCELLED' } },
        _sum: { visitorCount: true },
      }),
      tx.passOrder.aggregate({
        where: { timeSlotId, validFrom, status: 'PENDING', expiresAt: { gt: new Date() }, id: excludeOrderId ? { not: excludeOrderId } : undefined },
        _sum: { visitorCount: true },
      }),
    ]);
    const used = (issued._sum.visitorCount ?? 0) + (held._sum.visitorCount ?? 0);
    if (used + adding > capacity) {
      throw new ConflictException({
        message: used >= capacity ? 'This slot is full.' : `Only ${capacity - used} place(s) left in this slot.`,
        code: 'SLOT_FULL',
      });
    }
  }

  /** Remaining places per slot for one calendar window (issued + held). */
  async slotRemaining(timeSlotId: string, validFrom: Date, capacity: number | null): Promise<number | null> {
    if (capacity === null) return null;
    const [issued, held] = await Promise.all([
      this.prisma.token.aggregate({ where: { timeSlotId, validFrom, status: { not: 'CANCELLED' } }, _sum: { visitorCount: true } }),
      this.prisma.passOrder.aggregate({ where: { timeSlotId, validFrom, status: 'PENDING', expiresAt: { gt: new Date() } }, _sum: { visitorCount: true } }),
    ]);
    return Math.max(0, capacity - (issued._sum.visitorCount ?? 0) - (held._sum.visitorCount ?? 0));
  }

  /** Mints one token inside the caller's transaction (online pass orders). */
  async mintToken(
    tx: Prisma.TransactionClient,
    event: { id: string; tokenPrefix: string; startDate: Date },
    data: { timeSlotId: string; validFrom: Date; validUntil: Date; visitorCount: number; visitorName: string; visitorMobile: string; passOrderId?: string; sponsorIds?: string[]; partnerCampaignIds?: string[] },
  ) {
    const seq = await this.reserveSeq(tx, event.id, 1);
    const visitor = await tx.visitor.create({ data: { eventId: event.id, name: data.visitorName, mobile: data.visitorMobile } });
    return tx.token.create({
      data: {
        eventId: event.id, tokenCode: this.code(event, seq), secureToken: this.qr.newSecureToken(), visitorId: visitor.id,
        timeSlotId: data.timeSlotId, visitorCount: data.visitorCount, validFrom: data.validFrom, validUntil: data.validUntil,
        passOrderId: data.passOrderId ?? null, sponsorIds: data.sponsorIds ?? [], partnerCampaignIds: data.partnerCampaignIds ?? [],
      },
    });
  }

  /** Atomically reserves `n` sequence numbers on the event row. */
  private async reserveSeq(tx: Prisma.TransactionClient, eventId: string, n: number): Promise<number> {
    const rows = await tx.$queryRaw<{ tokenSeq: number }[]>`
      UPDATE events SET "tokenSeq" = "tokenSeq" + ${n} WHERE id = ${eventId} RETURNING "tokenSeq"`;
    return rows[0].tokenSeq - n + 1;
  }

  private code(event: { tokenPrefix: string; startDate: Date }, seq: number) {
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
    const visitorCount = dto.visitorCount ?? 1;
    const ids = await this.prisma.$transaction((tx) => this.issueInTx(tx, actor, event, perms, dto));
    if (!(dto.perPerson && visitorCount > 1)) return this.getWithQr(event.id, ids[0]);
    const tokens = await Promise.all(ids.map((id) => this.getWithQr(event.id, id)));
    return { count: tokens.length, tokens };
  }

  /** Issue inside the caller's transaction (desk issuance, passes for a donation). Returns token ids. */
  async issueInTx(
    tx: Prisma.TransactionClient, actor: RequestUser, event: EventRef, perms: Set<string>, dto: IssueTokenDto, donationId?: string,
  ): Promise<string[]> {
    this.assertCanIssue(event);
    const visitorCount = this.visitorCount(event, dto.visitorCount);
    const mobile = dto.visitorMobile ? normalizeMobile(dto.visitorMobile) : null;
    const perPerson = !!dto.perPerson && visitorCount > 1;
    {
      const v = await this.resolveValidity(tx, event, dto, perms);
      await this.checkCapacity(tx, v, visitorCount);
      const n = perPerson ? visitorCount : 1;
      const first = await this.reserveSeq(tx, event.id, n);
      // Prepaid credit: same transaction — no credit, no pass.
      const { sponsorIds, partnerCampaignIds } = await this.billing.charge(tx, {
        organizationId: event.organizationId, eventId: event.id, tokenCount: n, personCount: visitorCount,
        source: donationId ? 'DONATION' : 'DESK', actorId: actor.id,
        reference: n === 1 ? this.code(event, first) : `${this.code(event, first)} … ${this.code(event, first + n - 1)}`,
      });
      const visitor = dto.visitorName || mobile
        ? await tx.visitor.create({ data: { eventId: event.id, name: dto.visitorName?.trim() ?? null, mobile } })
        : null;
      const out: string[] = [];
      for (let i = 0; i < n; i++) {
        const token = await tx.token.create({
          data: {
            eventId: event.id, tokenCode: this.code(event, first + i), secureToken: this.qr.newSecureToken(),
            visitorId: visitor?.id ?? null, timeSlotId: v.timeSlotId, visitorCount: perPerson ? 1 : visitorCount,
            validFrom: v.validFrom, validUntil: v.validUntil, issuedById: actor.id, donationId: donationId ?? null, sponsorIds, partnerCampaignIds,
          },
        });
        out.push(token.id);
      }
      return out;
    }
  }

  async bulkGenerate(actor: RequestUser, event: EventRef, perms: Set<string>, dto: BulkGenerateDto) {
    this.assertCanIssue(event);
    const visitorCount = this.visitorCount(event, dto.visitorCount);

    const ids = await this.prisma.$transaction(async (tx) => {
      const v = await this.resolveValidity(tx, event, dto, perms);
      await this.checkCapacity(tx, v, visitorCount * dto.count);
      const first = await this.reserveSeq(tx, event.id, dto.count);
      const { sponsorIds, partnerCampaignIds } = await this.billing.charge(tx, {
        organizationId: event.organizationId, eventId: event.id, tokenCount: dto.count, personCount: dto.count * visitorCount,
        source: 'BULK', actorId: actor.id, reference: `${this.code(event, first)} … ${this.code(event, first + dto.count - 1)}`,
      });
      const rows = Array.from({ length: dto.count }, (_, i) => ({
        id: randomUUID(), eventId: event.id, tokenCode: this.code(event, first + i), secureToken: this.qr.newSecureToken(),
        timeSlotId: v.timeSlotId, visitorCount, validFrom: v.validFrom, validUntil: v.validUntil, issuedById: actor.id, sponsorIds, partnerCampaignIds,
      }));
      await tx.token.createMany({ data: rows });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'token.bulk_generated',
        entityType: 'Token', after: { count: dto.count, from: rows[0].tokenCode, to: rows[rows.length - 1].tokenCode, validFrom: v.validFrom, validUntil: v.validUntil, timeSlotId: v.timeSlotId },
      }, tx);
      return rows.map((r) => r.id);
    }, { timeout: 30_000 });

    const tokens = await this.prisma.token.findMany({ where: { id: { in: ids } }, select: tokenSelect, orderBy: { tokenCode: 'asc' } });
    // One batch = one charge, so every token carries the same printed partners.
    const printedPartners = await this.partners.printed(tokens[0]?.partnerCampaignIds ?? []);
    const printFormat = await this.billing.printFormat(this.prisma, event.organizationId, (tokens[0]?.sponsorIds.length ?? 0) + printedPartners.length);
    return { count: tokens.length, tokens: tokens.map((t) => ({ ...presentToken(t, this.qr.payloadFor(t.secureToken)), printedPartners, printFormat })) };
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
    const ev = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
    return {
      ...presentToken(t, this.qr.payloadFor(t.secureToken)),
      printedPartners: await this.partners.printed(t.partnerCampaignIds),
      printFormat: await this.billing.printFormat(this.prisma, ev.organizationId, t.sponsorIds.length + t.partnerCampaignIds.length),
    };
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
