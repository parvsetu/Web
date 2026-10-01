import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerCampaignStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { paged, paging, searchTerm } from '../../common/http';
import { ymd } from '../../common/time/validity';
import { rupees, toPaise } from '../billing/billing.service';
import { partnerToday } from './partner-billing.service';
import { AdminCampaignQuery, AdminPartnerQuery, CampaignReviewDto, PartnerStatusDto } from './partners.dto';
import { campaignInclude, creditPartner, PartnersService, partnerSelect, presentCampaign, presentPartner, walletTransactions } from './partners.service';

/** From → to moves the super admin may make on a campaign (conditional UPDATE on `from`). */
const MOVES: Record<CampaignReviewDto['action'], { from: PartnerCampaignStatus[]; to: PartnerCampaignStatus; done: string }> = {
  APPROVE: { from: ['REQUESTED'], to: 'APPROVED', done: 'approved' },
  REJECT: { from: ['REQUESTED'], to: 'REJECTED', done: 'rejected' },
  PAUSE: { from: ['APPROVED'], to: 'PAUSED', done: 'paused' },
  RESUME: { from: ['PAUSED'], to: 'APPROVED', done: 'resumed' },
  END: { from: ['APPROVED', 'PAUSED'], to: 'ENDED', done: 'ended' },
};

/**
 * Super admin side of promotional partners. The platform alone approves both
 * the brand account and every campaign — the mandal is not asked (it earns
 * nothing from partner money). A campaign can only be approved once its
 * partner is ACTIVE, so the account review always comes first.
 */
@Injectable()
export class PartnersAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly partners: PartnersService) {}

  async list(q: AdminPartnerQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const term = searchTerm(q.q);
    const where: Prisma.PartnerWhereInput = {
      status: q.status,
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { contactEmail: { contains: term, mode: 'insensitive' } }, { contactPhone: { contains: term } }, { contactName: { contains: term, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.partner.findMany({
        where, orderBy: [{ createdAt: 'desc' }], skip, take,
        select: { ...partnerSelect, users: { select: { id: true, email: true, mobile: true, emailVerifiedAt: true }, take: 1 } },
      }),
      this.prisma.partner.count({ where }),
    ]);
    const counts = rows.length
      ? await this.prisma.partnerCampaign.groupBy({ by: ['partnerId', 'status'], where: { partnerId: { in: rows.map((r) => r.id) } }, _count: { _all: true } })
      : [];
    return paged(await Promise.all(rows.map(async ({ users, ...p }) => ({
      ...presentPartner(p),
      login: users[0] ? { email: users[0].email, mobile: users[0].mobile, emailVerified: !!users[0].emailVerifiedAt } : null,
      wallet: await this.partners.walletState(this.prisma, p),
      campaigns: Object.fromEntries(counts.filter((c) => c.partnerId === p.id).map((c) => [c.status, c._count._all])),
    }))), total, page, pageSize);
  }

  async setStatus(actorId: string, partnerId: string, dto: PartnerStatusDto) {
    const before = await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { status: true } });
    if (!before) throw new NotFoundException('Partner not found');
    if (before.status === dto.status) throw new ConflictException({ message: `This partner is already ${dto.status.toLowerCase()}.`, code: 'NO_CHANGE' });
    if (dto.status === 'SUSPENDED' && before.status !== 'ACTIVE') throw new ConflictException({ message: 'Only an active partner can be suspended.', code: 'BAD_TRANSITION' });
    if (dto.status !== 'ACTIVE' && !dto.note?.trim()) throw new BadRequestException('Add a note explaining why.');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.partner.update({
        where: { id: partnerId }, select: partnerSelect,
        data: { status: dto.status, reviewNote: dto.note?.trim() || null, reviewedAt: new Date() },
      });
      // A rejected brand's open requests are closed with it.
      if (dto.status === 'REJECTED') {
        await tx.partnerCampaign.updateMany({
          where: { partnerId, status: 'REQUESTED' },
          data: { status: 'REJECTED', reviewNote: 'Partner account not approved', reviewedById: actorId, reviewedAt: new Date() },
        });
      }
      await this.audit.log({ actorId, action: 'partner.status_changed', entityType: 'Partner', entityId: partnerId, before, after: { status: p.status }, reason: dto.note }, tx);
      return presentPartner(p);
    });
  }

  async adjust(actorId: string, partnerId: string, amountPaise: number, reason: string) {
    if (!amountPaise) throw new BadRequestException('Amount cannot be zero');
    if (!(await this.prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } }))) throw new NotFoundException('Partner not found');
    await this.prisma.$transaction(async (tx) => {
      // Same lock as charging (partner row), so it never races a pass print.
      await creditPartner(tx, partnerId, amountPaise, 'ADJUSTMENT', { note: reason, createdById: actorId });
      await this.audit.log({ actorId, action: 'partner.wallet_adjusted', entityType: 'Partner', entityId: partnerId, after: { amount: rupees(amountPaise) }, reason }, tx);
    });
    return presentPartner(await this.prisma.partner.findUniqueOrThrow({ where: { id: partnerId }, select: partnerSelect }));
  }

  transactions(partnerId: string, q: { page?: number; pageSize?: number }) {
    return walletTransactions(this.prisma, partnerId, q);
  }

  async campaigns(q: AdminCampaignQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const term = searchTerm(q.q);
    const where: Prisma.PartnerCampaignWhereInput = {
      status: q.status, partnerId: q.partnerId,
      ...(term ? { OR: [{ partner: { name: { contains: term, mode: 'insensitive' } } }, { organization: { name: { contains: term, mode: 'insensitive' } } }, { message: { contains: term, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.partnerCampaign.findMany({ where, include: campaignInclude, orderBy: { createdAt: q.status === 'REQUESTED' ? 'asc' : 'desc' }, skip, take }),
      this.prisma.partnerCampaign.count({ where }),
    ]);
    return paged(rows.map((c) => presentCampaign(c, { admin: true })), total, page, pageSize);
  }

  async review(actorId: string, id: string, dto: CampaignReviewDto) {
    const before = await this.prisma.partnerCampaign.findUnique({ where: { id }, include: campaignInclude });
    if (!before) throw new NotFoundException('Campaign not found');
    const move = MOVES[dto.action];
    if (dto.rate !== undefined && dto.action !== 'APPROVE') throw new BadRequestException('The rate can only be set when approving; it is locked afterwards.');
    if (dto.action === 'REJECT' && !dto.note?.trim()) throw new BadRequestException('Add a note telling the partner why.');
    if (dto.action === 'APPROVE') {
      if (before.partner.status !== 'ACTIVE') {
        throw new ConflictException({ message: 'Approve the partner account first — campaigns can only be approved for an active partner.', code: 'PARTNER_NOT_ACTIVE' });
      }
      if (ymd(before.endDate) < partnerToday()) throw new ConflictException({ message: 'This campaign has already ended its dates.', code: 'CAMPAIGN_EXPIRED' });
    }
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.partnerCampaign.updateMany({
        where: { id, status: { in: move.from } },
        data: {
          status: move.to, reviewNote: dto.note?.trim() || undefined, reviewedById: actorId, reviewedAt: now,
          ...(dto.action === 'APPROVE' ? { approvedAt: now, ...(dto.rate !== undefined ? { ratePaise: toPaise(dto.rate) } : {}) } : {}),
        },
      });
      if (moved.count !== 1) {
        throw new ConflictException({ message: `A ${before.status.toLowerCase()} campaign cannot be ${move.done}.`, code: 'BAD_TRANSITION' });
      }
      const after = await tx.partnerCampaign.findUniqueOrThrow({ where: { id }, include: campaignInclude });
      await this.audit.log({
        actorId, action: `partner_campaign.${dto.action.toLowerCase()}`, entityType: 'PartnerCampaign', entityId: id,
        before: { status: before.status, rate: rupees(before.ratePaise) },
        after: { status: after.status, rate: rupees(after.ratePaise), organizationId: after.organizationId, eventId: after.eventId }, reason: dto.note,
      }, tx);
      return presentCampaign(after, { admin: true });
    });
  }
}
