import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { paged, paging } from '../../common/http';

type Db = Prisma.TransactionClient | PrismaService;

export const rupees = (paise: number) => (paise / 100).toFixed(2);
export const toPaise = (rupeeString: string) => Math.round(Number(rupeeString) * 100);

/** Commission per person admitted, in paise (rounded half-up to the paisa). */
export function unitFeePaise(tokenPricePaise: number, commissionBps: number) {
  return Math.round((tokenPricePaise * commissionBps) / 10000);
}

export type CreditState = 'OK' | 'LOW' | 'EXHAUSTED';

export interface ChargeInput {
  organizationId: string;
  eventId?: string | null;
  tokenCount: number;
  personCount: number;
  source: 'DESK' | 'BULK' | 'ONLINE' | 'DONATION';
  reference?: string;
  passOrderId?: string;
  actorId?: string | null;
  /** false for paid online orders: the commission is taken by the payment split, not credit. */
  includeCommission?: boolean;
}

export const LOW_CREDIT_MESSAGE = 'Your token credit is running low. Please recharge your credit to continue generating Online Passes.';
export const EXHAUSTED_MESSAGE = 'Your token credit has been exhausted. Online Passes cannot be generated until you recharge your credit.';

/**
 * Prepaid token credit. Every pass generated anywhere (desk, bulk, online,
 * donation) calls charge() inside the SAME transaction that creates it:
 *
 *   UPDATE org_billing SET credit = credit - fee
 *   WHERE organization = ? AND credit >= fee RETURNING credit
 *
 * If no row comes back the whole transaction (and therefore the pass) is
 * rolled back with 402 CREDIT_EXHAUSTED. Concurrent issuers serialize on the
 * row; a CHECK (credit >= 0) constraint is the final backstop.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async settings(db: Db = this.prisma) {
    return db.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  }

  /** Creates the mandal's account on first use, crediting the welcome credit once. */
  async ensureAccount(db: Db, organizationId: string) {
    const s = await this.settings(db);
    const inserted = await db.$queryRaw<{ organizationId: string }[]>`
      INSERT INTO org_billing ("organizationId", "creditBalancePaise", "updatedAt")
      VALUES (${organizationId}, ${s.welcomeCreditPaise}, now())
      ON CONFLICT ("organizationId") DO NOTHING RETURNING "organizationId"`;
    if (inserted.length && s.welcomeCreditPaise > 0) {
      await db.creditTransaction.create({
        data: { organizationId, type: 'WELCOME', amountPaise: s.welcomeCreditPaise, balanceAfterPaise: s.welcomeCreditPaise, note: 'Welcome credit' },
      });
    }
  }

  async rates(db: Db, organizationId: string) {
    const [s, b] = await Promise.all([this.settings(db), db.orgBilling.findUnique({ where: { organizationId } })]);
    const tokenPricePaise = b?.tokenPricePaise ?? s.defaultTokenPricePaise;
    const commissionBps = b?.commissionBps ?? s.defaultCommissionBps;
    return {
      tokenPricePaise, commissionBps,
      lowCreditThresholdPaise: b?.lowCreditThresholdPaise ?? s.lowCreditThresholdPaise,
      unitFeePaise: unitFeePaise(tokenPricePaise, commissionBps),
      sponsorPassFeePaise: b?.sponsorPassFeePaise ?? s.sponsorPassFeePaise,
    };
  }

  /** Partners whose logo/tagline is printed on this festival's passes (max 3, by tier). */
  async passSponsors(db: Db, organizationId: string, eventId?: string | null) {
    const rows = await db.sponsor.findMany({
      where: { organizationId, isActive: true, showOnPasses: true, OR: [{ eventId: null }, ...(eventId ? [{ eventId }] : [])] },
      select: { id: true, tier: true, sortOrder: true, name: true },
    });
    const rank: Record<string, number> = { TITLE: 0, PLATINUM: 1, GOLD: 2, SILVER: 3, PARTNER: 4 };
    return rows.sort((a, b) => rank[a.tier] - rank[b.tier] || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).slice(0, 3).map((r) => r.id);
  }

  async charge(tx: Prisma.TransactionClient, c: ChargeInput) {
    await this.ensureAccount(tx, c.organizationId);
    const r = await this.rates(tx, c.organizationId);
    const sponsorIds = await this.passSponsors(tx, c.organizationId, c.eventId);
    const commission = c.includeCommission === false ? 0 : r.unitFeePaise * c.personCount;
    // Partner promotion: per printed pass, per partner on it.
    const sponsorFee = r.sponsorPassFeePaise * c.tokenCount * sponsorIds.length;
    const fee = commission + sponsorFee;
    const rows = await tx.$queryRaw<{ creditBalancePaise: number }[]>`
      UPDATE org_billing SET
        "creditBalancePaise" = "creditBalancePaise" - ${fee},
        "totalTokens" = "totalTokens" + ${c.tokenCount},
        "totalPersons" = "totalPersons" + ${c.personCount},
        "totalFeesPaise" = "totalFeesPaise" + ${commission},
        "totalSponsorFeesPaise" = "totalSponsorFeesPaise" + ${sponsorFee},
        "updatedAt" = now()
      WHERE "organizationId" = ${c.organizationId} AND "creditBalancePaise" >= ${fee}
      RETURNING "creditBalancePaise"`;
    if (rows.length === 0) {
      const b = await tx.orgBilling.findUnique({ where: { organizationId: c.organizationId } });
      const balance = b?.creditBalancePaise ?? 0;
      throw new HttpException({
        statusCode: 402, code: 'CREDIT_EXHAUSTED',
        message: balance < r.unitFeePaise ? EXHAUSTED_MESSAGE : `Not enough token credit for ${c.personCount} passes. ${this.leftText(balance, r.unitFeePaise)} Please recharge to continue.`,
        balance: rupees(balance), required: rupees(fee),
        tokensLeft: r.unitFeePaise > 0 ? Math.floor(balance / r.unitFeePaise) : null,
      }, 402);
    }
    await tx.creditTransaction.create({
      data: {
        organizationId: c.organizationId, type: 'TOKEN_FEE', amountPaise: -fee, balanceAfterPaise: rows[0].creditBalancePaise,
        eventId: c.eventId ?? null, source: c.source, tokenCount: c.tokenCount, personCount: c.personCount,
        unitFeePaise: c.includeCommission === false ? 0 : r.unitFeePaise, tokenPricePaise: r.tokenPricePaise, commissionBps: r.commissionBps,
        sponsorFeePaise: sponsorFee, sponsorIds,
        reference: c.reference?.slice(0, 300) ?? null, passOrderId: c.passOrderId ?? null, createdById: c.actorId ?? null,
      },
    });
    if (sponsorIds.length) {
      await tx.sponsor.updateMany({
        where: { id: { in: sponsorIds } },
        data: { passesPrinted: { increment: c.tokenCount }, printFeesPaise: { increment: r.sponsorPassFeePaise * c.tokenCount } },
      });
    }
    return { feePaise: fee, balancePaise: rows[0].creditBalancePaise, sponsorIds };
  }

  private leftText(balance: number, unit: number) {
    return unit > 0 ? `Credit left covers ${Math.floor(balance / unit)} more.` : '';
  }

  /** Returns a held online-order fee when the order fails or expires (once). */
  async refundOrder(tx: Prisma.TransactionClient, passOrderId: string, why: string) {
    const fee = await tx.creditTransaction.findFirst({ where: { passOrderId, type: 'TOKEN_FEE' } });
    if (!fee || fee.amountPaise === 0) return;
    if (await tx.creditTransaction.findFirst({ where: { passOrderId, type: 'REFUND' } })) return;
    const back = -fee.amountPaise;
    const rows = await tx.$queryRaw<{ creditBalancePaise: number }[]>`
      UPDATE org_billing SET "creditBalancePaise" = "creditBalancePaise" + ${back},
        "totalTokens" = "totalTokens" - ${fee.tokenCount}, "totalPersons" = "totalPersons" - ${fee.personCount},
        "totalFeesPaise" = "totalFeesPaise" - ${back - fee.sponsorFeePaise},
        "totalSponsorFeesPaise" = "totalSponsorFeesPaise" - ${fee.sponsorFeePaise}, "updatedAt" = now()
      WHERE "organizationId" = ${fee.organizationId} RETURNING "creditBalancePaise"`;
    await tx.creditTransaction.create({
      data: {
        organizationId: fee.organizationId, type: 'REFUND', amountPaise: back, balanceAfterPaise: rows[0].creditBalancePaise,
        eventId: fee.eventId, source: fee.source, tokenCount: -fee.tokenCount, personCount: -fee.personCount, passOrderId, note: why,
        sponsorFeePaise: -fee.sponsorFeePaise, sponsorIds: fee.sponsorIds,
      },
    });
    if (fee.sponsorIds.length && fee.tokenCount) {
      const each = fee.sponsorFeePaise / fee.sponsorIds.length;
      await tx.sponsor.updateMany({
        where: { id: { in: fee.sponsorIds } },
        data: { passesPrinted: { decrement: fee.tokenCount }, printFeesPaise: { decrement: each } },
      });
    }
  }

  private async credit(tx: Prisma.TransactionClient, organizationId: string, amountPaise: number, type: 'RECHARGE' | 'ADJUSTMENT', extra: Partial<Prisma.CreditTransactionUncheckedCreateInput>) {
    await this.ensureAccount(tx, organizationId);
    const rows = await tx.$queryRaw<{ creditBalancePaise: number }[]>`
      UPDATE org_billing SET "creditBalancePaise" = "creditBalancePaise" + ${amountPaise},
        "totalRechargedPaise" = "totalRechargedPaise" + ${type === 'RECHARGE' ? amountPaise : 0}, "updatedAt" = now()
      WHERE "organizationId" = ${organizationId} AND "creditBalancePaise" + ${amountPaise} >= 0
      RETURNING "creditBalancePaise"`;
    if (!rows.length) throw new BadRequestException('That adjustment would make the credit negative.');
    return tx.creditTransaction.create({
      data: { organizationId, type, amountPaise, balanceAfterPaise: rows[0].creditBalancePaise, ...extra },
    });
  }

  // ─── Status / history ──────────────────────────────────────────────

  async status(organizationId: string) {
    await this.ensureAccount(this.prisma, organizationId);
    const [b, r] = await Promise.all([
      this.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId } }),
      this.rates(this.prisma, organizationId),
    ]);
    const tokensLeft = r.unitFeePaise > 0 ? Math.floor(b.creditBalancePaise / r.unitFeePaise) : null;
    const state: CreditState = r.unitFeePaise > 0 && b.creditBalancePaise < r.unitFeePaise
      ? 'EXHAUSTED'
      : b.creditBalancePaise < r.lowCreditThresholdPaise ? 'LOW' : 'OK';
    return {
      state,
      message: state === 'EXHAUSTED' ? EXHAUSTED_MESSAGE : state === 'LOW' ? LOW_CREDIT_MESSAGE : null,
      balance: rupees(b.creditBalancePaise),
      tokenPrice: rupees(r.tokenPricePaise),
      commissionPercent: (r.commissionBps / 100).toFixed(2),
      feePerPass: rupees(r.unitFeePaise),
      partnerPrintFeePerPass: rupees(r.sponsorPassFeePaise),
      tokensLeft,
      lowCreditThreshold: rupees(r.lowCreditThresholdPaise),
      totals: { tokens: b.totalTokens, persons: b.totalPersons, fees: rupees(b.totalFeesPaise), partnerFees: rupees(b.totalSponsorFeesPaise), recharged: rupees(b.totalRechargedPaise) },
      overrides: { tokenPrice: b.tokenPricePaise !== null, commission: b.commissionBps !== null, lowCreditThreshold: b.lowCreditThresholdPaise !== null, partnerPrintFee: b.sponsorPassFeePaise !== null },
    };
  }

  async transactions(q: { organizationId?: string; type?: string; source?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.CreditTransactionWhereInput = {
      organizationId: q.organizationId, type: q.type as Prisma.EnumCreditTxTypeFilter['equals'], source: q.source,
    };
    const [rows, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { organization: { select: { name: true } } } }),
      this.prisma.creditTransaction.count({ where }),
    ]);
    const eventIds = [...new Set(rows.map((r) => r.eventId).filter(Boolean))] as string[];
    const events = eventIds.length ? await this.prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } }) : [];
    return paged(rows.map((t) => ({
      id: t.id, createdAt: t.createdAt, type: t.type, source: t.source, organization: { id: t.organizationId, name: t.organization.name },
      event: t.eventId ? events.find((e) => e.id === t.eventId) ?? null : null,
      amount: rupees(t.amountPaise), balanceAfter: rupees(t.balanceAfterPaise), tokenCount: t.tokenCount, personCount: t.personCount,
      feePerPass: t.unitFeePaise !== null ? rupees(t.unitFeePaise) : null,
      tokenPrice: t.tokenPricePaise !== null ? rupees(t.tokenPricePaise) : null,
      commissionPercent: t.commissionBps !== null ? (t.commissionBps / 100).toFixed(2) : null,
      reference: t.reference, note: t.note, partnerFee: rupees(t.sponsorFeePaise), partnersPrinted: t.sponsorIds.length,
    })), total, page, pageSize);
  }

  // ─── Recharge (demo self-service) & admin adjustments ──────────────

  async startRecharge(actorId: string, organizationId: string, amountPaise: number) {
    if (amountPaise < 100) throw new BadRequestException('Minimum recharge is ₹1');
    const r = await this.prisma.creditRecharge.create({
      data: {
        organizationId, amountPaise, paymentProvider: 'demo', providerOrderId: `demo_${randomBytes(8).toString('hex')}`,
        createdById: actorId, expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return this.presentRecharge(r);
  }

  /** Demo checkout result. Idempotent; serialized on the recharge row. */
  async completeRecharge(actorId: string, organizationId: string, rechargeId: string, outcome: 'success' | 'fail') {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM credit_recharges WHERE id = ${rechargeId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Recharge not found');
      const r = await tx.creditRecharge.findUniqueOrThrow({ where: { id: rechargeId } });
      if (r.status === 'PAID') return;
      if (r.status !== 'PENDING') throw new ConflictException({ message: 'This recharge is no longer open.', code: 'RECHARGE_CLOSED' });
      if (r.expiresAt <= new Date()) {
        await tx.creditRecharge.update({ where: { id: r.id }, data: { status: 'EXPIRED' } });
        throw new ConflictException({ message: 'This recharge expired. Please start again.', code: 'RECHARGE_EXPIRED' });
      }
      if (outcome === 'fail') {
        await tx.creditRecharge.update({ where: { id: r.id }, data: { status: 'FAILED' } });
        return;
      }
      const ref = `demo_pay_${randomBytes(6).toString('hex')}`;
      await tx.creditRecharge.update({ where: { id: r.id }, data: { status: 'PAID', paidAt: new Date(), paymentReference: ref } });
      await this.credit(tx, organizationId, r.amountPaise, 'RECHARGE', { rechargeId: r.id, reference: ref, createdById: actorId, note: 'Online recharge (demo)' });
      await this.audit.log({ organizationId, actorId, action: 'credit.recharged', entityType: 'CreditRecharge', entityId: r.id, after: { amount: rupees(r.amountPaise) } }, tx);
    });
    return this.presentRecharge(await this.prisma.creditRecharge.findUniqueOrThrow({ where: { id: rechargeId } }));
  }

  async recharges(organizationId: string, q: { page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const [rows, total] = await Promise.all([
      this.prisma.creditRecharge.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.creditRecharge.count({ where: { organizationId } }),
    ]);
    return paged(rows.map((r) => this.presentRecharge(r)), total, page, pageSize);
  }

  private presentRecharge(r: { id: string; amountPaise: number; status: string; paymentProvider: string; paymentReference: string | null; createdAt: Date; paidAt: Date | null; expiresAt: Date }) {
    return { id: r.id, amount: rupees(r.amountPaise), status: r.status, provider: r.paymentProvider, paymentReference: r.paymentReference, createdAt: r.createdAt, paidAt: r.paidAt, expiresAt: r.expiresAt };
  }

  async adjust(actorId: string, organizationId: string, amountPaise: number, reason: string) {
    if (!amountPaise) throw new BadRequestException('Amount cannot be zero');
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Mandal not found');
    await this.prisma.$transaction(async (tx) => {
      await this.credit(tx, organizationId, amountPaise, 'ADJUSTMENT', { note: reason, createdById: actorId });
      await this.audit.log({ organizationId, actorId, action: 'credit.adjusted', entityType: 'OrgBilling', entityId: organizationId, after: { amount: rupees(amountPaise) }, reason }, tx);
    });
    return this.status(organizationId);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async updateSettings(actorId: string, dto: { defaultTokenPrice?: string; defaultCommissionPercent?: string; lowCreditThreshold?: string; welcomeCredit?: string; partnerPrintFee?: string; gatewayFeePercent?: string }) {
    const before = await this.settings();
    const data: Prisma.PlatformSettingsUpdateInput = { updatedById: actorId };
    if (dto.defaultTokenPrice !== undefined) data.defaultTokenPricePaise = toPaise(dto.defaultTokenPrice);
    if (dto.defaultCommissionPercent !== undefined) data.defaultCommissionBps = Math.round(Number(dto.defaultCommissionPercent) * 100);
    if (dto.lowCreditThreshold !== undefined) data.lowCreditThresholdPaise = toPaise(dto.lowCreditThreshold);
    if (dto.welcomeCredit !== undefined) data.welcomeCreditPaise = toPaise(dto.welcomeCredit);
    if (dto.partnerPrintFee !== undefined) data.sponsorPassFeePaise = toPaise(dto.partnerPrintFee);
    if (dto.gatewayFeePercent !== undefined) data.gatewayFeeBps = Math.round(Number(dto.gatewayFeePercent) * 100);
    const after = await this.prisma.platformSettings.update({ where: { id: 'default' }, data });
    await this.audit.log({ actorId, action: 'billing.settings_updated', entityType: 'PlatformSettings', entityId: 'default', before, after });
    return this.presentSettings(after);
  }

  presentSettings(s: { defaultTokenPricePaise: number; defaultCommissionBps: number; lowCreditThresholdPaise: number; welcomeCreditPaise: number; sponsorPassFeePaise: number; gatewayFeeBps: number; updatedAt: Date }) {
    return {
      defaultTokenPrice: rupees(s.defaultTokenPricePaise), defaultCommissionPercent: (s.defaultCommissionBps / 100).toFixed(2),
      lowCreditThreshold: rupees(s.lowCreditThresholdPaise), welcomeCredit: rupees(s.welcomeCreditPaise),
      feePerPass: rupees(unitFeePaise(s.defaultTokenPricePaise, s.defaultCommissionBps)), partnerPrintFee: rupees(s.sponsorPassFeePaise), gatewayFeePercent: (s.gatewayFeeBps / 100).toFixed(2), updatedAt: s.updatedAt,
    };
  }

  /** Per-mandal pricing overrides; null resets to the platform default. */
  async updateMandal(actorId: string, organizationId: string, dto: { tokenPrice?: string | null; commissionPercent?: string | null; lowCreditThreshold?: string | null; partnerPrintFee?: string | null }) {
    await this.ensureAccount(this.prisma, organizationId);
    const data: Prisma.OrgBillingUpdateInput = {};
    if (dto.tokenPrice !== undefined) data.tokenPricePaise = dto.tokenPrice === null ? null : toPaise(dto.tokenPrice);
    if (dto.commissionPercent !== undefined) data.commissionBps = dto.commissionPercent === null ? null : Math.round(Number(dto.commissionPercent) * 100);
    if (dto.lowCreditThreshold !== undefined) data.lowCreditThresholdPaise = dto.lowCreditThreshold === null ? null : toPaise(dto.lowCreditThreshold);
    if (dto.partnerPrintFee !== undefined) data.sponsorPassFeePaise = dto.partnerPrintFee === null ? null : toPaise(dto.partnerPrintFee);
    const before = await this.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId } });
    const after = await this.prisma.orgBilling.update({ where: { organizationId }, data });
    await this.audit.log({ organizationId, actorId, action: 'billing.mandal_pricing_updated', entityType: 'OrgBilling', entityId: organizationId, before, after });
    return this.status(organizationId);
  }

  async mandals(q: { state?: string; q?: string; page?: number; pageSize?: number }) {
    const orgs = await this.prisma.organization.findMany({
      where: q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {},
      select: { id: true, name: true, city: true, state: true },
      orderBy: { name: 'asc' },
    });
    const rows = await Promise.all(orgs.map(async (o) => ({ ...o, billing: await this.status(o.id) })));
    const filtered = q.state ? rows.filter((r) => r.billing.state === q.state) : rows;
    const { page, pageSize, skip, take } = paging(q);
    return paged(filtered.slice(skip, skip + take), filtered.length, page, pageSize);
  }

  async summary() {
    const split = await this.prisma.paymentSettlement.aggregate({ _sum: { commissionPaise: true, grossPaise: true, gatewayFeePaise: true } });
    const [agg, recharges, byType, accounts] = await Promise.all([
      this.prisma.orgBilling.aggregate({ _sum: { totalSponsorFeesPaise: true, totalFeesPaise: true, totalTokens: true, totalPersons: true, creditBalancePaise: true, totalRechargedPaise: true } }),
      this.prisma.creditRecharge.count({ where: { status: 'PAID' } }),
      this.prisma.creditTransaction.groupBy({ by: ['source'], where: { type: 'TOKEN_FEE' }, _sum: { amountPaise: true, tokenCount: true } }),
      this.prisma.organization.findMany({ select: { id: true } }),
    ]);
    const states = await Promise.all(accounts.map((a) => this.status(a.id).then((s) => s.state)));
    return {
      commissionEarned: rupees(agg._sum.totalFeesPaise ?? 0),
      partnerFeesEarned: rupees(agg._sum.totalSponsorFeesPaise ?? 0),
      splitCommissionEarned: rupees(split._sum.commissionPaise ?? 0),
      onlineGross: rupees(split._sum.grossPaise ?? 0),
      totalEarned: rupees((agg._sum.totalFeesPaise ?? 0) + (agg._sum.totalSponsorFeesPaise ?? 0) + (split._sum.commissionPaise ?? 0)),
      tokensGenerated: agg._sum.totalTokens ?? 0,
      personsAdmitted: agg._sum.totalPersons ?? 0,
      creditOutstanding: rupees(agg._sum.creditBalancePaise ?? 0),
      totalRecharged: rupees(agg._sum.totalRechargedPaise ?? 0),
      paidRecharges: recharges,
      mandals: { total: accounts.length, low: states.filter((s) => s === 'LOW').length, exhausted: states.filter((s) => s === 'EXHAUSTED').length },
      bySource: byType.map((b) => ({ source: b.source, commission: rupees(-(b._sum.amountPaise ?? 0)), tokens: b._sum.tokenCount ?? 0 })),
    };
  }
}
