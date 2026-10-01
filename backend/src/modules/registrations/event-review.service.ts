import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventApprovalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { DECLARATION_VERSION } from '../../common/legal';
import { paged, paging, searchTerm } from '../../common/http';
import { ymd } from '../../common/time/validity';
import { rupees, toPaise } from '../billing/billing.service';
import { presentApproval } from '../events/events.service';
import { EventFeeService, presentFeePayment } from './event-fee.service';
import { assertDeclaration, RequestMeta } from './registrations.service';
import { ApproveEventDto, EventReviewQuery } from './registrations.dto';

const reviewInclude = {
  organization: { select: { id: true, name: true, city: true, state: true, festivalTypes: true, agent: { select: { id: true, name: true, code: true } } } },
  feePayments: { orderBy: { createdAt: 'desc' as const }, take: 3 },
  _count: { select: { tokens: true } },
} as const;
type ReviewRow = Prisma.EventGetPayload<{ include: typeof reviewInclude }>;

/**
 * Per-event platform review for mandals that are already approved: the mandal
 * submits (with the content-policy declaration) → the super admin approves
 * (fee locked, pay link opened), requests changes or rejects → the fee is paid
 * → LIVE. A LIVE event can still be unpublished for a policy violation.
 */
@Injectable()
export class EventReviewService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly fees: EventFeeService) {}

  /** Mandal: review state, quote and pay link of one event. */
  async approval(eventId: string) {
    const e = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: reviewInclude });
    const quote = await this.fees.quote(this.prisma, e.organizationId, e.festivalType);
    const custom = await this.prisma.customFestivalType.findUnique({ where: { key: e.festivalType } });
    return {
      ...presentApproval(e),
      quote: { fee: rupees(e.feeQuotedPaise ?? quote.feePaise), source: e.feeQuotedPaise !== null ? e.feeSource : quote.source },
      customFestival: custom ? { label: custom.label, group: custom.group, status: custom.status, inCatalog: custom.inCatalog } : null,
      payments: e.feePayments.map(presentFeePayment),
      canSubmit: e.approvalStatus === 'DRAFT' || e.approvalStatus === 'CHANGES_REQUESTED',
    };
  }

  async submit(actor: RequestUser, eventId: string, accepted: boolean | undefined, meta: RequestMeta) {
    assertDeclaration(accepted);
    const before = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const quote = await this.fees.quote(this.prisma, before.organizationId, before.festivalType);
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.event.updateMany({
        where: { id: eventId, approvalStatus: { in: ['DRAFT', 'CHANGES_REQUESTED'] } },
        data: { approvalStatus: 'SUBMITTED', submittedAt: new Date(), submittedById: actor.id, feeQuotedPaise: quote.feePaise, feeSource: quote.source },
      });
      if (moved.count !== 1) {
        throw new ConflictException({ statusCode: 409, code: 'EVENT_ALREADY_SUBMITTED', message: `This festival is already ${before.approvalStatus.toLowerCase().replace(/_/g, ' ')}.` });
      }
      await tx.legalDeclaration.create({
        data: { version: DECLARATION_VERSION, context: 'EVENT_SUBMISSION', eventId, acceptedById: actor.id, ipAddress: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
      });
      await this.audit.log({
        organizationId: before.organizationId, eventId, actorId: actor.id, action: 'event.submitted', entityType: 'Event', entityId: eventId,
        before: { approvalStatus: before.approvalStatus }, after: { approvalStatus: 'SUBMITTED', feeQuoted: rupees(quote.feePaise), feeSource: quote.source, declaration: DECLARATION_VERSION },
      }, tx);
    });
    return this.approval(eventId);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async list(q: EventReviewQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.EventWhereInput = {
      approvalStatus: (q.status ?? 'SUBMITTED') as EventApprovalStatus,
      organizationId: q.organizationId,
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { organization: { name: { contains: t, mode: 'insensitive' } } }, { city: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({ where, include: reviewInclude, orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }], skip, take }),
      this.prisma.event.count({ where }),
    ]);
    const customs = await this.prisma.customFestivalType.findMany({ where: { key: { in: rows.map((r) => r.festivalType) } } });
    return paged(rows.map((r) => this.present(r, customs.find((c) => c.key === r.festivalType) ?? null)), total, page, pageSize);
  }

  private present(e: ReviewRow, custom: { label: string; group: string; description: string | null; status: string; inCatalog: boolean } | null) {
    return {
      id: e.id, name: e.name, festivalType: e.festivalType, description: e.description, location: e.location, venueAddress: e.venueAddress,
      city: e.city, state: e.state, startDate: ymd(e.startDate), endDate: ymd(e.endDate), status: e.status,
      organization: { id: e.organization.id, name: e.organization.name, city: e.organization.city, state: e.organization.state, agent: e.organization.agent },
      approval: presentApproval(e),
      customFestival: custom,
      passesIssued: e._count.tokens,
      payments: e.feePayments.map(presentFeePayment),
    };
  }

  private async lockEvent(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${id} FOR UPDATE`;
    const e = await tx.event.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Event not found');
    return e;
  }

  private conflict(status: string, what: string) {
    return new ConflictException({ statusCode: 409, code: 'EVENT_REVIEW_STATE', message: `A ${status.toLowerCase().replace(/_/g, ' ')} festival can't be ${what}.` });
  }

  async approve(actorId: string, eventId: string, dto: ApproveEventDto) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lockEvent(tx, eventId);
      if (e.approvalStatus !== 'SUBMITTED') throw this.conflict(e.approvalStatus, 'approved');
      const feePaise = dto.fee !== undefined ? toPaise(dto.fee) : (e.feeQuotedPaise ?? (await this.fees.quote(tx, e.organizationId, e.festivalType)).feePaise);
      const live = feePaise === 0;
      const now = new Date();
      await tx.event.update({
        where: { id: eventId },
        data: {
          approvalStatus: live ? 'LIVE' : 'APPROVED_AWAITING_PAYMENT', feePaise, feeSource: dto.fee !== undefined ? 'ADMIN' : e.feeSource,
          reviewedAt: now, reviewedById: actorId, reviewNote: null, liveAt: live ? now : null, status: live && e.status === 'DRAFT' ? 'ACTIVE' : undefined,
        },
      });
      // "My event isn't listed": approving the event approves the mandal's custom type (and optionally lists it for everyone).
      const custom = await tx.customFestivalType.findUnique({ where: { key: e.festivalType } });
      if (custom && custom.organizationId === e.organizationId && custom.status !== 'APPROVED') {
        await tx.customFestivalType.update({ where: { key: custom.key }, data: { status: 'APPROVED', inCatalog: !!dto.addToCatalog, reviewedById: actorId, reviewedAt: now } });
      } else if (custom && dto.addToCatalog && !custom.inCatalog) {
        await tx.customFestivalType.update({ where: { key: custom.key }, data: { inCatalog: true, status: 'APPROVED', reviewedById: actorId, reviewedAt: now } });
      }
      if (custom) {
        const org = await tx.organization.findUniqueOrThrow({ where: { id: e.organizationId }, select: { festivalTypes: true } });
        if (org.festivalTypes.length && !org.festivalTypes.includes(custom.key)) {
          await tx.organization.update({ where: { id: e.organizationId }, data: { festivalTypes: [...org.festivalTypes, custom.key] } });
        }
      }
      if (!live) await this.fees.openLink(tx, e, feePaise, actorId);
      await this.audit.log({
        organizationId: e.organizationId, eventId, actorId, action: 'event.approved', entityType: 'Event', entityId: eventId,
        before: { approvalStatus: e.approvalStatus, feeQuoted: e.feeQuotedPaise !== null ? rupees(e.feeQuotedPaise) : null },
        after: { approvalStatus: live ? 'LIVE' : 'APPROVED_AWAITING_PAYMENT', fee: rupees(feePaise), addedToCatalog: !!dto.addToCatalog },
      }, tx);
    });
    return this.one(eventId);
  }

  async requestChanges(actorId: string, eventId: string, note: string) {
    return this.move(actorId, eventId, ['SUBMITTED'], 'CHANGES_REQUESTED', note, 'event.changes_requested', 'sent back for changes');
  }

  async reject(actorId: string, eventId: string, reason: string) {
    return this.move(actorId, eventId, ['SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'DRAFT'], 'REJECTED', reason, 'event.rejected', 'rejected');
  }

  /** Policy violation on a LIVE event: unpublished at once (bookings, passes and scanning stop). */
  async unpublish(actorId: string, eventId: string, reason: string) {
    return this.move(actorId, eventId, ['LIVE'], 'REJECTED', reason, 'event.unpublished_policy_violation', 'unpublished');
  }

  private async move(actorId: string, eventId: string, from: EventApprovalStatus[], to: EventApprovalStatus, note: string, action: string, what: string) {
    await this.prisma.$transaction(async (tx) => {
      const e = await this.lockEvent(tx, eventId);
      if (!from.includes(e.approvalStatus)) throw this.conflict(e.approvalStatus, what);
      await tx.event.update({
        where: { id: eventId },
        data: { approvalStatus: to, reviewNote: note.trim(), reviewedAt: new Date(), reviewedById: actorId, ...(to === 'REJECTED' ? { liveAt: null, status: e.status === 'ACTIVE' ? 'DRAFT' : undefined } : {}) },
      });
      if (to === 'REJECTED') {
        await tx.eventFeePayment.updateMany({ where: { eventId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
        await tx.customFestivalType.updateMany({ where: { key: e.festivalType, organizationId: e.organizationId, status: 'PENDING' }, data: { status: 'REJECTED', reviewedById: actorId, reviewedAt: new Date() } });
      }
      await this.audit.log({
        organizationId: e.organizationId, eventId, actorId, action, entityType: 'Event', entityId: eventId,
        before: { approvalStatus: e.approvalStatus, status: e.status }, after: { approvalStatus: to }, reason: note.trim(),
      }, tx);
    });
    return this.one(eventId);
  }

  async one(eventId: string) {
    const e = await this.prisma.event.findUnique({ where: { id: eventId }, include: reviewInclude });
    if (!e) throw new NotFoundException('Event not found');
    const custom = await this.prisma.customFestivalType.findUnique({ where: { key: e.festivalType } });
    return this.present(e, custom);
  }
}
