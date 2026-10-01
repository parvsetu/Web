import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Partner, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { dateOnly, ymd } from '../../common/time/validity';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { OtpService, maskEmail } from '../auth/otp.service';
import { BillingService, rupees } from '../billing/billing.service';
import { parseLogo } from '../sponsors/sponsors.service';
import { partnerLogoUrl, partnerToday } from './partner-billing.service';
import { CampaignListQuery, CreateCampaignDto, MandalBrowseQuery, PartnerSignupDto, UpdatePartnerDto } from './partners.dto';
import { PartnerCtx } from './partner.guard';

type Db = Prisma.TransactionClient | PrismaService;
export type WalletState = 'OK' | 'LOW' | 'EXHAUSTED';

/** Longest campaign a partner can request in one go. */
const MAX_CAMPAIGN_DAYS = 366;

export const campaignInclude = {
  organization: { select: { id: true, name: true, city: true, state: true } },
  event: { select: { id: true, name: true, festivalType: true, startDate: true, endDate: true } },
  partner: { select: { id: true, name: true, status: true, walletBalancePaise: true } },
} as const;
type CampaignRow = Prisma.PartnerCampaignGetPayload<{ include: typeof campaignInclude }>;

/**
 * Whether an APPROVED campaign actually prints right now — the status alone
 * doesn't say (dates, cap, wallet and partner status all matter).
 */
export function printingState(c: CampaignRow, today = partnerToday()) {
  if (c.status !== 'APPROVED') return null;
  if (ymd(c.startDate) > today) return 'SCHEDULED';
  if (ymd(c.endDate) < today) return 'EXPIRED';
  if (c.maxPasses !== null && c.passesPrinted >= c.maxPasses) return 'CAP_REACHED';
  if (c.partner.status !== 'ACTIVE') return 'PARTNER_INACTIVE';
  if (c.partner.walletBalancePaise < c.ratePaise) return 'WALLET_EMPTY';
  return 'LIVE';
}

export function presentCampaign(c: CampaignRow, opts: { admin?: boolean } = {}) {
  return {
    id: c.id, status: c.status, printing: printingState(c), message: c.message,
    startDate: ymd(c.startDate), endDate: ymd(c.endDate), maxPasses: c.maxPasses,
    rate: rupees(c.ratePaise), passesPrinted: c.passesPrinted, spent: rupees(c.spentPaise),
    /** Most this campaign can cost (rate × cap); null without a cap. */
    estimate: c.maxPasses !== null ? rupees(c.ratePaise * c.maxPasses) : null,
    organization: c.organization,
    event: c.event ? { id: c.event.id, name: c.event.name, festivalType: c.event.festivalType, startDate: ymd(c.event.startDate), endDate: ymd(c.event.endDate) } : null,
    reviewNote: c.reviewNote, reviewedAt: c.reviewedAt, approvedAt: c.approvedAt, createdAt: c.createdAt,
    ...(opts.admin ? { partner: { id: c.partner.id, name: c.partner.name, status: c.partner.status, walletBalance: rupees(c.partner.walletBalancePaise) } } : {}),
  };
}

/** Every Partner column except the logo bytes (logoType says whether there is one). */
export const partnerSelect = Object.fromEntries(
  Object.keys(Prisma.PartnerScalarFieldEnum).filter((k) => k !== 'logo').map((k) => [k, true]),
) as { [K in Exclude<keyof typeof Prisma.PartnerScalarFieldEnum, 'logo'>]: true };
export type PartnerRow = Omit<Partner, 'logo'>;

export function presentPartner(p: PartnerRow) {
  return {
    id: p.id, name: p.name, legalName: p.legalName, gstin: p.gstin, contactName: p.contactName, contactEmail: p.contactEmail, contactPhone: p.contactPhone,
    websiteUrl: p.websiteUrl, tagline: p.tagline, logoUrl: partnerLogoUrl(p), status: p.status, reviewNote: p.reviewNote, reviewedAt: p.reviewedAt,
    walletBalance: rupees(p.walletBalancePaise), totalRecharged: rupees(p.totalRechargedPaise), totalSpent: rupees(p.totalSpentPaise), createdAt: p.createdAt,
  };
}

/** Partner (and super admin) view of the wallet ledger. */
export async function walletTransactions(db: PrismaService, partnerId: string, q: { page?: number; pageSize?: number }) {
  const { page, pageSize, skip, take } = paging(q, 25);
  const [rows, total] = await Promise.all([
    db.partnerWalletTransaction.findMany({ where: { partnerId }, orderBy: { createdAt: 'desc' }, skip, take }),
    db.partnerWalletTransaction.count({ where: { partnerId } }),
  ]);
  const orgIds = [...new Set(rows.map((r) => r.organizationId).filter(Boolean))] as string[];
  const eventIds = [...new Set(rows.map((r) => r.eventId).filter(Boolean))] as string[];
  const [orgs, events] = await Promise.all([
    orgIds.length ? db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
    eventIds.length ? db.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } }) : [],
  ]);
  return paged(rows.map((t) => ({
    id: t.id, createdAt: t.createdAt, type: t.type, amount: rupees(t.amountPaise), balanceAfter: rupees(t.balanceAfterPaise),
    tokenCount: t.tokenCount, note: t.note, campaignId: t.campaignId,
    organization: orgs.find((o) => o.id === t.organizationId) ?? null, event: events.find((e) => e.id === t.eventId) ?? null,
  })), total, page, pageSize);
}

/** Credits a partner wallet (recharge / admin adjustment). Refuses to go below 0. */
export async function creditPartner(
  tx: Prisma.TransactionClient, partnerId: string, amountPaise: number, type: 'RECHARGE' | 'ADJUSTMENT', extra: { note?: string; rechargeId?: string; createdById?: string },
) {
  const rows = await tx.$queryRaw<{ walletBalancePaise: number }[]>`
    UPDATE partners SET "walletBalancePaise" = "walletBalancePaise" + ${amountPaise},
      "totalRechargedPaise" = "totalRechargedPaise" + ${type === 'RECHARGE' ? amountPaise : 0}, "updatedAt" = now()
    WHERE id = ${partnerId} AND "walletBalancePaise" + ${amountPaise} >= 0
    RETURNING "walletBalancePaise"`;
  if (!rows.length) throw new BadRequestException('That adjustment would make the wallet negative.');
  return tx.partnerWalletTransaction.create({
    data: { partnerId, type, amountPaise, balanceAfterPaise: rows[0].walletBalancePaise, note: extra.note ?? null, rechargeId: extra.rechargeId ?? null, createdById: extra.createdById ?? null },
  });
}

/**
 * Promotional partner portal: signup, profile, mandal browsing, campaign
 * requests, wallet and demo recharge. Every money rule is server-side; the
 * per-pass rate is quoted from the mandal's billing at request time.
 */
@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly otp: OtpService,
    private readonly billing: BillingService,
  ) {}

  // ─── Signup ────────────────────────────────────────────────────────

  async signup(dto: PartnerSignupDto) {
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email)!;
    if (await this.prisma.user.findUnique({ where: { mobile } })) {
      throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const p = await tx.partner.create({
        data: {
          name: dto.brandName.trim(), contactName: dto.contactName.trim(), contactEmail: email, contactPhone: mobile,
          gstin: dto.gstin || null, websiteUrl: dto.websiteUrl || null,
        },
      });
      // Locked until the emailed code is entered (same flow as volunteer signup).
      const u = await tx.user.create({ data: { name: dto.contactName.trim(), mobile, email, passwordHash, requiresEmailVerification: true, partnerId: p.id } });
      await this.audit.log({ actorId: u.id, action: 'partner.signed_up', entityType: 'Partner', entityId: p.id, after: { name: p.name, email } }, tx);
      return u;
    });
    try {
      await this.otp.issue({ id: user.id, name: user.name, email }, 'VERIFY_EMAIL');
    } catch (e) {
      if (!(e instanceof HttpException && e.getStatus() === 429)) throw e;
    }
    return { verificationRequired: true, email, maskedEmail: maskEmail(email) };
  }

  // ─── Profile & overview ────────────────────────────────────────────

  async walletState(db: Db, p: PartnerRow) {
    const [s, rates] = await Promise.all([
      this.billing.settings(db),
      db.partnerCampaign.findMany({ where: { partnerId: p.id, status: 'APPROVED', endDate: { gte: dateOnly(partnerToday()) } }, select: { ratePaise: true } }),
    ]);
    const r = rates.map((x) => x.ratePaise);
    const min = r.length ? Math.min(...r) : 0;
    const max = r.length ? Math.max(...r) : 0;
    const state: WalletState = (r.length && p.walletBalancePaise < min) || (r.length && p.walletBalancePaise === 0)
      ? 'EXHAUSTED'
      : p.walletBalancePaise < s.lowCreditThresholdPaise || (r.length > 0 && p.walletBalancePaise < max * 100) ? 'LOW' : 'OK';
    return {
      state,
      message: state === 'EXHAUSTED'
        ? 'Your wallet is empty — your approved campaigns have stopped printing. Recharge to resume.'
        : state === 'LOW' ? 'Your wallet is running low. Recharge so your campaigns keep printing.' : null,
      passesLeft: max > 0 ? Math.floor(p.walletBalancePaise / max) : null,
    };
  }

  async overview(partner: PartnerCtx) {
    const p = await this.prisma.partner.findUniqueOrThrow({ where: { id: partner.id }, select: partnerSelect });
    const [wallet, byStatus, printed] = await Promise.all([
      this.walletState(this.prisma, p),
      this.prisma.partnerCampaign.groupBy({ by: ['status'], where: { partnerId: p.id }, _count: { _all: true } }),
      this.prisma.partnerCampaign.aggregate({ where: { partnerId: p.id }, _sum: { passesPrinted: true, spentPaise: true } }),
    ]);
    const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    return {
      partner: presentPartner(p), wallet,
      stats: {
        approved: count('APPROVED'), requested: count('REQUESTED'), paused: count('PAUSED'),
        passesPrinted: printed._sum.passesPrinted ?? 0, spent: rupees(printed._sum.spentPaise ?? 0),
      },
    };
  }

  async updateProfile(actor: RequestUser, partner: PartnerCtx, dto: UpdatePartnerDto) {
    const before = await this.prisma.partner.findUniqueOrThrow({ where: { id: partner.id }, select: partnerSelect });
    const logo = dto.logoDataUrl ? parseLogo(dto.logoDataUrl) : null;
    const opt = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    const data: Prisma.PartnerUpdateInput = {
      name: dto.name?.trim(), legalName: opt(dto.legalName), gstin: opt(dto.gstin), contactName: dto.contactName?.trim(),
      contactEmail: dto.contactEmail ? normalizeEmail(dto.contactEmail)! : undefined,
      contactPhone: dto.contactPhone ? normalizeMobile(dto.contactPhone) : undefined,
      websiteUrl: opt(dto.websiteUrl), tagline: opt(dto.tagline),
      ...(logo ? { logo: logo.bytes, logoType: logo.type } : dto.removeLogo ? { logo: null, logoType: null } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.partner.update({ where: { id: partner.id }, data, select: partnerSelect });
      const { logoUrl: _a, ...b } = presentPartner(before);
      const { logoUrl: _b, ...a } = presentPartner(p);
      await this.audit.log({ actorId: actor.id, action: 'partner.profile_updated', entityType: 'Partner', entityId: p.id, before: b, after: { ...a, logoChanged: !!logo || !!dto.removeLogo } }, tx);
      return presentPartner(p);
    });
  }

  async logo(id: string) {
    const p = await this.prisma.partner.findUnique({ where: { id }, select: { logo: true, logoType: true } });
    if (!p?.logo || !p.logoType) throw new NotFoundException('No logo');
    return { bytes: Buffer.from(p.logo), type: p.logoType };
  }

  // ─── Mandal directory ──────────────────────────────────────────────

  /** Mandals with an upcoming or running festival, each with its per-pass partner rate. */
  async mandals(q: MandalBrowseQuery) {
    const { page, pageSize, skip, take } = paging(q, 12);
    const today = dateOnly(partnerToday());
    const live: Prisma.EventWhereInput = { status: { in: ['ACTIVE', 'DRAFT'] }, endDate: { gte: today } };
    const term = searchTerm(q.q);
    const where: Prisma.OrganizationWhereInput = {
      events: { some: live },
      state: q.state || undefined,
      city: q.city ? { equals: q.city, mode: 'insensitive' } : undefined,
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { city: { contains: term, mode: 'insensitive' } }, { events: { some: { ...live, name: { contains: term, mode: 'insensitive' } } } }] } : {}),
    };
    const [orgs, total, settings] = await Promise.all([
      this.prisma.organization.findMany({
        where, orderBy: { name: 'asc' }, skip, take,
        select: {
          id: true, name: true, city: true, state: true,
          billing: { select: { sponsorPassFeePaise: true } },
          events: { where: live, orderBy: { startDate: 'asc' }, take: 10, select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, status: true, city: true } },
        },
      }),
      this.prisma.organization.count({ where }),
      this.billing.settings(),
    ]);
    return paged(orgs.map((o) => ({
      id: o.id, name: o.name, city: o.city, state: o.state,
      ratePerPass: rupees(o.billing?.sponsorPassFeePaise ?? settings.sponsorPassFeePaise),
      events: o.events.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate) })),
    })), total, page, pageSize);
  }

  // ─── Campaigns ─────────────────────────────────────────────────────

  async campaigns(partner: PartnerCtx, q: CampaignListQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const where: Prisma.PartnerCampaignWhereInput = { partnerId: partner.id, status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.partnerCampaign.findMany({ where, include: campaignInclude, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.partnerCampaign.count({ where }),
    ]);
    return paged(rows.map((c) => presentCampaign(c)), total, page, pageSize);
  }

  async requestCampaign(actor: RequestUser, partner: PartnerCtx, dto: CreateCampaignDto) {
    const start = dateOnly(dto.startDate);
    const end = dateOnly(dto.endDate);
    const today = partnerToday();
    if (dto.startDate < today) throw new BadRequestException('The start date cannot be in the past.');
    if (end < start) throw new BadRequestException('The end date must be on or after the start date.');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > MAX_CAMPAIGN_DAYS) throw new BadRequestException(`A campaign can run for at most ${MAX_CAMPAIGN_DAYS} days.`);
    const org = await this.prisma.organization.findUnique({ where: { id: dto.organizationId }, select: { id: true, name: true } });
    if (!org) throw new NotFoundException('Mandal not found');
    if (dto.eventId) {
      const ev = await this.prisma.event.findFirst({
        where: { id: dto.eventId, organizationId: org.id, status: { in: ['ACTIVE', 'DRAFT'] } },
        select: { startDate: true, endDate: true },
      });
      if (!ev) throw new NotFoundException('That festival is not open for partners.');
      if (start > ev.endDate || end < ev.startDate) {
        throw new BadRequestException(`Pick dates that overlap the festival (${ymd(ev.startDate)} to ${ymd(ev.endDate)}).`);
      }
    }
    // The rate is quoted now; the super admin may change it when approving, then it is locked.
    const r = await this.billing.rates(this.prisma, org.id);
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.partnerCampaign.create({
        data: {
          partnerId: partner.id, organizationId: org.id, eventId: dto.eventId ?? null, message: dto.message.trim(),
          startDate: start, endDate: end, maxPasses: dto.maxPasses ?? null, ratePaise: r.sponsorPassFeePaise,
        },
        include: campaignInclude,
      });
      await this.audit.log({ actorId: actor.id, action: 'partner_campaign.requested', entityType: 'PartnerCampaign', entityId: c.id, after: presentCampaign(c) }, tx);
      return presentCampaign(c);
    });
  }

  async cancelCampaign(actor: RequestUser, partner: PartnerCtx, id: string) {
    const before = await this.prisma.partnerCampaign.findFirst({ where: { id, partnerId: partner.id }, select: { status: true } });
    if (!before) throw new NotFoundException('Campaign not found');
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.partnerCampaign.updateMany({ where: { id, partnerId: partner.id, status: { in: ['REQUESTED', 'APPROVED', 'PAUSED'] } }, data: { status: 'CANCELLED' } });
      if (moved.count !== 1) throw new ConflictException({ message: `A ${before.status.toLowerCase()} campaign cannot be cancelled.`, code: 'CAMPAIGN_CLOSED' });
      await this.audit.log({ actorId: actor.id, action: 'partner_campaign.cancelled', entityType: 'PartnerCampaign', entityId: id, before: { status: before.status }, after: { status: 'CANCELLED' } }, tx);
      return presentCampaign(await tx.partnerCampaign.findUniqueOrThrow({ where: { id }, include: campaignInclude }));
    });
  }

  // ─── Wallet & demo recharge (mirrors the mandal credit recharge) ───

  transactions(partner: PartnerCtx, q: { page?: number; pageSize?: number }) {
    return walletTransactions(this.prisma, partner.id, q);
  }

  async recharges(partner: PartnerCtx, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 10);
    const [rows, total] = await Promise.all([
      this.prisma.partnerRecharge.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.partnerRecharge.count({ where: { partnerId: partner.id } }),
    ]);
    return paged(rows.map((r) => this.presentRecharge(r)), total, page, pageSize);
  }

  async startRecharge(actor: RequestUser, partner: PartnerCtx, amountPaise: number) {
    if (amountPaise < 100) throw new BadRequestException('Minimum recharge is ₹1');
    const r = await this.prisma.partnerRecharge.create({
      data: {
        partnerId: partner.id, amountPaise, paymentProvider: 'demo', providerOrderId: `demo_${randomBytes(8).toString('hex')}`,
        createdById: actor.id, expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return this.presentRecharge(r);
  }

  /** Demo checkout result. Idempotent; serialized on the recharge row. */
  async completeRecharge(actor: RequestUser, partner: PartnerCtx, rechargeId: string, outcome: 'success' | 'fail') {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM partner_recharges WHERE id = ${rechargeId} AND "partnerId" = ${partner.id} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Recharge not found');
      const r = await tx.partnerRecharge.findUniqueOrThrow({ where: { id: rechargeId } });
      if (r.status === 'PAID') return;
      if (r.status !== 'PENDING') throw new ConflictException({ message: 'This recharge is no longer open.', code: 'RECHARGE_CLOSED' });
      if (r.expiresAt <= new Date()) {
        await tx.partnerRecharge.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
        throw new ConflictException({ message: 'This recharge expired. Please start again.', code: 'RECHARGE_EXPIRED' });
      }
      if (outcome === 'fail') {
        await tx.partnerRecharge.update({ where: { id: r.id }, data: { status: 'FAILED' } });
        return;
      }
      const ref = `demo_pay_${randomBytes(6).toString('hex')}`;
      await tx.partnerRecharge.update({ where: { id: r.id }, data: { status: 'PAID', paidAt: new Date(), paymentReference: ref } });
      await creditPartner(tx, partner.id, r.amountPaise, 'RECHARGE', { rechargeId: r.id, createdById: actor.id, note: 'Online recharge (demo)' });
      await this.audit.log({ actorId: actor.id, action: 'partner.recharged', entityType: 'PartnerRecharge', entityId: r.id, after: { partnerId: partner.id, amount: rupees(r.amountPaise) } }, tx);
    });
    return this.presentRecharge(await this.prisma.partnerRecharge.findUniqueOrThrow({ where: { id: rechargeId } }));
  }

  private presentRecharge(r: { id: string; amountPaise: number; status: string; paymentProvider: string; paymentReference: string | null; createdAt: Date; paidAt: Date | null; expiresAt: Date }) {
    return { id: r.id, amount: rupees(r.amountPaise), status: r.status, provider: r.paymentProvider, paymentReference: r.paymentReference, createdAt: r.createdAt, paidAt: r.paidAt, expiresAt: r.expiresAt };
  }
}
