import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { paged, paging } from '../../common/http';
import { PartnerBillingService } from '../partners/partner-billing.service';
import { landingActive } from '../../common/org-brand';

type Db = Prisma.TransactionClient | PrismaService;

export const rupees = (paise: number) => (paise / 100).toFixed(2);
export const toPaise = (rupeeString: string) => Math.round(Number(rupeeString) * 100);

/** Commission per person admitted, in paise (rounded half-up to the paisa). */
export function unitFeePaise(tokenPricePaise: number, commissionBps: number) {
  return Math.round((tokenPricePaise * commissionBps) / 10000);
}

export type CreditState = 'OK' | 'LOW' | 'EXHAUSTED';

export const PASS_PRINT_FORMATS = ['AUTO', 'A4', 'THERMAL_80', 'THERMAL_58'] as const;
export type PassPrintSetting = (typeof PASS_PRINT_FORMATS)[number];
export type PassPrintFormat = Exclude<PassPrintSetting, 'AUTO'>;

/**
 * The layout a pass prints in. The super admin sets it per mandal (partner ads
 * print on passes, so the mandal can't choose). AUTO: a pass carrying 2+ ads
 * (mandal sponsors + platform partners) gets an A4 page so the logos stay
 * legible; otherwise a thermal 80 mm strip.
 */
export function resolvePrintFormat(setting: string | null | undefined, adCount: number): PassPrintFormat {
  if (setting === 'A4' || setting === 'THERMAL_80' || setting === 'THERMAL_58') return setting;
  return adCount >= 2 ? 'A4' : 'THERMAL_80';
}

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
 *
 * The mandal pays only the commission. Its own sponsors are printed free;
 * platform promotional partners are charged to THEIR wallets
 * (PartnerBillingService) in the same transaction, after the org row lock.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly partners: PartnerBillingService) {}

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
      /** What a promotional PARTNER pays per pass printed at this mandal (never the mandal). */
      sponsorPassFeePaise: b?.sponsorPassFeePaise ?? s.sponsorPassFeePaise,
      passPrintFormat: (b?.passPrintFormat ?? s.defaultPassPrintFormat) as PassPrintSetting,
      /** Yearly fee for the mandal's /m/<slug> landing page. */
      landingPagePricePaise: b?.landingPageYearlyPricePaise ?? s.landingPageYearlyPricePaise,
      /** Mandal-specific per-event registration fee (null = festival type / platform default). */
      eventFeeOverridePaise: b?.eventFeePaise ?? null,
    };
  }

  /** Effective print layout for a pass at this mandal carrying `adCount` ads. */
  async printFormat(db: Db, organizationId: string, adCount: number) {
    return resolvePrintFormat((await this.rates(db, organizationId)).passPrintFormat, adCount);
  }

  /** The mandal's own sponsors printed on this festival's passes (max 3, by tier) — free for the mandal. */
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
    // Showing the mandal's own sponsors on passes is free; only the commission is charged.
    const sponsorFee = 0;
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
    // Platform partners pay from their own wallets; never fails the pass.
    const partnerCampaignIds = await this.partners.charge(tx, {
      organizationId: c.organizationId, eventId: c.eventId, tokenCount: c.tokenCount, passOrderId: c.passOrderId, actorId: c.actorId,
    });
    await tx.creditTransaction.create({
      data: {
        organizationId: c.organizationId, type: 'TOKEN_FEE', amountPaise: -fee, balanceAfterPaise: rows[0].creditBalancePaise,
        eventId: c.eventId ?? null, source: c.source, tokenCount: c.tokenCount, personCount: c.personCount,
        unitFeePaise: c.includeCommission === false ? 0 : r.unitFeePaise, tokenPricePaise: r.tokenPricePaise, commissionBps: r.commissionBps,
        sponsorFeePaise: sponsorFee, sponsorIds, partnerCampaignIds,
        reference: c.reference?.slice(0, 300) ?? null, passOrderId: c.passOrderId ?? null, createdById: c.actorId ?? null,
      },
    });
    if (sponsorIds.length) {
      await tx.sponsor.updateMany({
        where: { id: { in: sponsorIds } },
        data: { passesPrinted: { increment: c.tokenCount } },
      });
    }
    return { feePaise: fee, balancePaise: rows[0].creditBalancePaise, sponsorIds, partnerCampaignIds };
  }

  private leftText(balance: number, unit: number) {
    return unit > 0 ? `Credit left covers ${Math.floor(balance / unit)} more.` : '';
  }

  /**
   * Returns a held online-order fee when the order fails or expires (once),
   * and what partners paid to be printed on it. Lock order matches charge():
   * org row first, then partner rows.
   */
  async refundOrder(tx: Prisma.TransactionClient, passOrderId: string, why: string) {
    await this.refundMandal(tx, passOrderId, why);
    await this.partners.refundOrder(tx, passOrderId, why);
  }

  private async refundMandal(tx: Prisma.TransactionClient, passOrderId: string, why: string) {
    const fee = await tx.creditTransaction.findFirst({ where: { passOrderId, type: 'TOKEN_FEE' } });
    if (!fee) return;
    if (await tx.creditTransaction.findFirst({ where: { passOrderId, type: 'REFUND' } })) return;
    if (fee.amountPaise === 0 && !fee.sponsorIds.length) return;
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
      // Legacy rows may still carry a print fee (mandals were charged before partners existed).
      const each = Math.round(fee.sponsorFeePaise / fee.sponsorIds.length);
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

  /**
   * How many single-person passes this event can still issue from credit: each one costs only
   * the commission (sponsors on passes are free for the mandal; platform partners pay their own way).
   */
  async eventAllowance(organizationId: string, _eventId: string) {
    const st = await this.status(organizationId);
    const [b, r] = await Promise.all([
      this.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId } }),
      this.rates(this.prisma, organizationId),
    ]);
    const perPass = r.unitFeePaise;
    return {
      state: st.state, message: st.message, balance: st.balance, feePerPass: rupees(perPass), commissionPerPass: rupees(r.unitFeePaise),
      tokensLeft: perPass > 0 ? Math.floor(b.creditBalancePaise / perPass) : null,
    };
  }

  async status(organizationId: string) {
    await this.ensureAccount(this.prisma, organizationId);
    const [b, r] = await Promise.all([
      this.prisma.orgBilling.findUniqueOrThrow({ where: { organizationId } }),
      this.rates(this.prisma, organizationId),
    ]);
    const tokensLeft = r.unitFeePaise > 0 ? Math.floor(b.creditBalancePaise / r.unitFeePaise) : null;
    const lp = await this.prisma.landingPage.findUnique({ where: { organizationId }, select: { paidUntil: true, enabled: true } });
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
      /** Partner rate per pass at this mandal — paid by promotional partners, not the mandal. */
      partnerRatePerPass: rupees(r.sponsorPassFeePaise),
      /** Pass print layout chosen by the platform (AUTO = by number of ads). */
      passPrintFormat: r.passPrintFormat,
      tokensLeft,
      lowCreditThreshold: rupees(r.lowCreditThresholdPaise),
      totals: { tokens: b.totalTokens, persons: b.totalPersons, fees: rupees(b.totalFeesPaise), partnerFees: rupees(b.totalSponsorFeesPaise), recharged: rupees(b.totalRechargedPaise) },
      /** Paid landing page at /m/<slug>: yearly fee and how long it is paid for. */
      landingPage: { price: rupees(r.landingPagePricePaise), paidUntil: lp?.paidUntil ?? null, active: landingActive(lp) },
      /** Per-event registration fee override for this mandal (null = by festival type / platform default). */
      eventFee: b.eventFeePaise !== null ? rupees(b.eventFeePaise) : null,
      overrides: { tokenPrice: b.tokenPricePaise !== null, commission: b.commissionBps !== null, lowCreditThreshold: b.lowCreditThresholdPaise !== null, partnerRate: b.sponsorPassFeePaise !== null, passPrintFormat: b.passPrintFormat !== null, landingPagePrice: b.landingPageYearlyPricePaise !== null, eventFee: b.eventFeePaise !== null },
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

  async updateSettings(actorId: string, dto: { defaultTokenPrice?: string; defaultCommissionPercent?: string; lowCreditThreshold?: string; welcomeCredit?: string; partnerRate?: string; gatewayFeePercent?: string; defaultPassPrintFormat?: PassPrintSetting; landingPageYearlyPrice?: string; defaultEventFee?: string; agentReferralFee?: string; agentCommissionPercent?: string }) {
    const before = await this.settings();
    const data: Prisma.PlatformSettingsUpdateInput = { updatedById: actorId };
    if (dto.defaultTokenPrice !== undefined) data.defaultTokenPricePaise = toPaise(dto.defaultTokenPrice);
    if (dto.defaultCommissionPercent !== undefined) data.defaultCommissionBps = Math.round(Number(dto.defaultCommissionPercent) * 100);
    if (dto.lowCreditThreshold !== undefined) data.lowCreditThresholdPaise = toPaise(dto.lowCreditThreshold);
    if (dto.welcomeCredit !== undefined) data.welcomeCreditPaise = toPaise(dto.welcomeCredit);
    if (dto.partnerRate !== undefined) data.sponsorPassFeePaise = toPaise(dto.partnerRate);
    if (dto.defaultPassPrintFormat !== undefined) data.defaultPassPrintFormat = dto.defaultPassPrintFormat;
    if (dto.landingPageYearlyPrice !== undefined) data.landingPageYearlyPricePaise = toPaise(dto.landingPageYearlyPrice);
    if (dto.gatewayFeePercent !== undefined) data.gatewayFeeBps = Math.round(Number(dto.gatewayFeePercent) * 100);
    if (dto.defaultEventFee !== undefined) data.defaultEventFeePaise = toPaise(dto.defaultEventFee);
    if (dto.agentReferralFee !== undefined) data.agentReferralFeePaise = toPaise(dto.agentReferralFee);
    if (dto.agentCommissionPercent !== undefined) data.agentCommissionBps = Math.round(Number(dto.agentCommissionPercent) * 100);
    const after = await this.prisma.platformSettings.update({ where: { id: 'default' }, data });
    await this.audit.log({ actorId, action: 'billing.settings_updated', entityType: 'PlatformSettings', entityId: 'default', before, after });
    return this.presentSettings(after);
  }

  presentSettings(s: { defaultTokenPricePaise: number; defaultCommissionBps: number; lowCreditThresholdPaise: number; welcomeCreditPaise: number; sponsorPassFeePaise: number; gatewayFeeBps: number; defaultPassPrintFormat: string; landingPageYearlyPricePaise: number; defaultEventFeePaise: number; agentReferralFeePaise: number; agentCommissionBps: number; updatedAt: Date }) {
    return {
      defaultTokenPrice: rupees(s.defaultTokenPricePaise), defaultCommissionPercent: (s.defaultCommissionBps / 100).toFixed(2),
      lowCreditThreshold: rupees(s.lowCreditThresholdPaise), welcomeCredit: rupees(s.welcomeCreditPaise),
      feePerPass: rupees(unitFeePaise(s.defaultTokenPricePaise, s.defaultCommissionBps)), partnerRate: rupees(s.sponsorPassFeePaise), gatewayFeePercent: (s.gatewayFeeBps / 100).toFixed(2), defaultPassPrintFormat: s.defaultPassPrintFormat,
      landingPageYearlyPrice: rupees(s.landingPageYearlyPricePaise),
      defaultEventFee: rupees(s.defaultEventFeePaise), agentReferralFee: rupees(s.agentReferralFeePaise), agentCommissionPercent: (s.agentCommissionBps / 100).toFixed(2),
      updatedAt: s.updatedAt,
    };
  }

  /** Per-mandal pricing overrides; null resets to the platform default. */
  async updateMandal(actorId: string, organizationId: string, dto: { tokenPrice?: string | null; commissionPercent?: string | null; lowCreditThreshold?: string | null; partnerRate?: string | null; passPrintFormat?: PassPrintSetting | null; landingPagePrice?: string | null; eventFee?: string | null }) {
    await this.ensureAccount(this.prisma, organizationId);
    const data: Prisma.OrgBillingUpdateInput = {};
    if (dto.tokenPrice !== undefined) data.tokenPricePaise = dto.tokenPrice === null ? null : toPaise(dto.tokenPrice);
    if (dto.commissionPercent !== undefined) data.commissionBps = dto.commissionPercent === null ? null : Math.round(Number(dto.commissionPercent) * 100);
    if (dto.lowCreditThreshold !== undefined) data.lowCreditThresholdPaise = dto.lowCreditThreshold === null ? null : toPaise(dto.lowCreditThreshold);
    if (dto.partnerRate !== undefined) data.sponsorPassFeePaise = dto.partnerRate === null ? null : toPaise(dto.partnerRate);
    if (dto.passPrintFormat !== undefined) data.passPrintFormat = dto.passPrintFormat;
    if (dto.landingPagePrice !== undefined) data.landingPageYearlyPricePaise = dto.landingPagePrice === null ? null : toPaise(dto.landingPagePrice);
    if (dto.eventFee !== undefined) data.eventFeePaise = dto.eventFee === null ? null : toPaise(dto.eventFee);
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
    const landing = await this.prisma.landingPurchase.aggregate({ where: { status: 'PAID' }, _sum: { amountPaise: true }, _count: { _all: true } });
    const landingPaise = landing._sum.amountPaise ?? 0;
    // Per-event registration fees actually collected (waived / refunded / open links excluded).
    const eventFees = await this.prisma.eventFeePayment.aggregate({ where: { status: 'PAID' }, _sum: { amountPaise: true }, _count: { _all: true } });
    const eventFeePaise = eventFees._sum.amountPaise ?? 0;
    const agentLedger = await this.prisma.agentLedgerEntry.groupBy({ by: ['type'], _sum: { amountPaise: true } });
    const agentSum = (t: string) => agentLedger.find((a) => a.type === t)?._sum.amountPaise ?? 0;
    const [agg, recharges, byType, accounts, partnerNet, wallets] = await Promise.all([
      this.prisma.orgBilling.aggregate({ _sum: { totalSponsorFeesPaise: true, totalFeesPaise: true, totalTokens: true, totalPersons: true, creditBalancePaise: true, totalRechargedPaise: true } }),
      this.prisma.creditRecharge.count({ where: { status: 'PAID' } }),
      this.prisma.creditTransaction.groupBy({ by: ['source'], where: { type: 'TOKEN_FEE' }, _sum: { amountPaise: true, tokenCount: true } }),
      this.prisma.organization.findMany({ select: { id: true } }),
      // Partner earnings: what partners paid for printed passes, net of refunds (100% platform).
      this.prisma.partnerWalletTransaction.aggregate({ where: { type: { in: ['PASS_PRINT', 'REFUND'] } }, _sum: { amountPaise: true } }),
      this.prisma.partner.aggregate({ _sum: { walletBalancePaise: true } }),
    ]);
    const partnerEarned = -(partnerNet._sum.amountPaise ?? 0);
    const states = await Promise.all(accounts.map((a) => this.status(a.id).then((s) => s.state)));
    return {
      commissionEarned: rupees(agg._sum.totalFeesPaise ?? 0),
      /** Legacy: print fees mandals paid before promotional partners existed. */
      partnerFeesEarned: rupees(agg._sum.totalSponsorFeesPaise ?? 0),
      promotionalPartnerEarned: rupees(partnerEarned),
      partnerWalletsOutstanding: rupees(wallets._sum.walletBalancePaise ?? 0),
      splitCommissionEarned: rupees(split._sum.commissionPaise ?? 0),
      onlineGross: rupees(split._sum.grossPaise ?? 0),
      /** Paid mandal landing pages (yearly fees; manual super-admin grants are free and not counted). */
      landingPageEarned: rupees(landingPaise),
      landingPagesSold: landing._count._all,
      /** Per-event registration fees paid by mandals (each event pays separately). */
      eventFeesEarned: rupees(eventFeePaise),
      eventFeesPaid: eventFees._count._all,
      /** Field-agent referral earnings: what the platform owes agents (not deducted from totalEarned). */
      agentEarningsDue: rupees(agentSum('EARNED') - agentSum('REVERSED') - agentSum('PAID')),
      agentPayoutsMade: rupees(agentSum('PAID')),
      totalEarned: rupees((agg._sum.totalFeesPaise ?? 0) + (agg._sum.totalSponsorFeesPaise ?? 0) + (split._sum.commissionPaise ?? 0) + partnerEarned + landingPaise + eventFeePaise),
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
