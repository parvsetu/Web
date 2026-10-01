import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Platform partners printed per pass, on top of up to 3 of the mandal's own sponsors. */
export const PLATFORM_PARTNERS_PER_PASS = 2;
/** Campaign dates are calendar days in India. */
export const PARTNER_TZ = 'Asia/Kolkata';
export const partnerToday = () => DateTime.now().setZone(PARTNER_TZ).toISODate()!;

export interface PartnerChargeInput {
  organizationId: string;
  eventId?: string | null;
  tokenCount: number;
  passOrderId?: string | null;
  actorId?: string | null;
}

export interface PrintedPartner {
  id: string;
  partnerId: string;
  name: string;
  message: string;
  tagline: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
}

/** Logo bytes are never loaded just to build the URL: logoType is set iff a logo exists. */
export const partnerLogoUrl = (p: { id: string; logoType: string | null; updatedAt: Date }) =>
  p.logoType ? `/public/partners/${p.id}/logo?v=${p.updatedAt.getTime()}` : null;

/**
 * Charges promotional partners for the passes being created, inside the
 * caller's transaction (the one that creates the pass). The pass must NEVER
 * fail because of a partner: a campaign that can't pay, is over its cap, or
 * was paused a moment ago is simply not printed.
 *
 * Lock order (deadlock-free with every other writer): org_billing (taken by
 * BillingService.charge first) → partners rows sorted by id → campaign rows
 * sorted by id. The wallet debit and the campaign increment are two
 * conditional UPDATEs under those locks; if the second one fails the first is
 * compensated, so a debit never exists without the matching print and vice
 * versa. walletBalancePaise has a CHECK (>= 0) as the final backstop.
 */
@Injectable()
export class PartnerBillingService {
  constructor(private readonly prisma: PrismaService) {}

  async charge(tx: Prisma.TransactionClient, c: PartnerChargeInput): Promise<string[]> {
    const n = c.tokenCount;
    if (n <= 0) return [];
    const today = partnerToday();
    const eventId = c.eventId ?? null;
    const candidates = await tx.$queryRaw<{ id: string; partnerId: string; ratePaise: number }[]>`
      SELECT c.id, c."partnerId", c."ratePaise" FROM partner_campaigns c JOIN partners p ON p.id = c."partnerId"
      WHERE c."organizationId" = ${c.organizationId} AND c.status = 'APPROVED' AND p.status = 'ACTIVE'
        AND (c."eventId" IS NULL OR c."eventId" = ${eventId})
        AND c."startDate" <= ${today}::date AND c."endDate" >= ${today}::date
        AND (c."maxPasses" IS NULL OR c."passesPrinted" + ${n} <= c."maxPasses")
        AND p."walletBalancePaise" >= c."ratePaise" * ${n}
      ORDER BY c."ratePaise" DESC, c."approvedAt" ASC NULLS LAST, c.id ASC`;
    if (!candidates.length) return [];
    // A brand appears once per pass even if it has a mandal-wide and an event campaign.
    const picked: typeof candidates = [];
    for (const k of candidates) if (!picked.some((p) => p.partnerId === k.partnerId)) picked.push(k);

    const partnerIds = [...new Set(picked.map((p) => p.partnerId))].sort();
    await tx.$queryRaw`SELECT id FROM partners WHERE id IN (${Prisma.join(partnerIds)}) ORDER BY id FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM partner_campaigns WHERE id IN (${Prisma.join(picked.map((p) => p.id).sort())}) ORDER BY id FOR UPDATE`;

    const printed: string[] = [];
    for (const k of picked) {
      if (printed.length >= PLATFORM_PARTNERS_PER_PASS) break;
      const cost = k.ratePaise * n;
      const w = await tx.$queryRaw<{ walletBalancePaise: number }[]>`
        UPDATE partners SET "walletBalancePaise" = "walletBalancePaise" - ${cost}, "totalSpentPaise" = "totalSpentPaise" + ${cost}, "updatedAt" = now()
        WHERE id = ${k.partnerId} AND status = 'ACTIVE' AND "walletBalancePaise" >= ${cost}
        RETURNING "walletBalancePaise"`;
      if (!w.length) continue;
      const camp = await tx.$queryRaw<{ id: string }[]>`
        UPDATE partner_campaigns SET "passesPrinted" = "passesPrinted" + ${n}, "spentPaise" = "spentPaise" + ${cost}, "updatedAt" = now()
        WHERE id = ${k.id} AND status = 'APPROVED' AND ("maxPasses" IS NULL OR "passesPrinted" + ${n} <= "maxPasses")
        RETURNING id`;
      if (!camp.length) {
        // Compensate: the campaign stopped (paused / cap reached) between the read and now.
        await tx.$executeRaw`
          UPDATE partners SET "walletBalancePaise" = "walletBalancePaise" + ${cost}, "totalSpentPaise" = "totalSpentPaise" - ${cost}
          WHERE id = ${k.partnerId}`;
        continue;
      }
      await tx.partnerWalletTransaction.create({
        data: {
          partnerId: k.partnerId, type: 'PASS_PRINT', amountPaise: -cost, balanceAfterPaise: w[0].walletBalancePaise, campaignId: k.id,
          organizationId: c.organizationId, eventId, passOrderId: c.passOrderId ?? null, tokenCount: n, createdById: c.actorId ?? null,
        },
      });
      printed.push(k.id);
    }
    return printed;
  }

  /**
   * Gives back what partners paid for an online order that failed/expired.
   * Idempotent: an order is refunded once (a REFUND row for it exists).
   */
  async refundOrder(tx: Prisma.TransactionClient, passOrderId: string, why: string) {
    const prints = await tx.partnerWalletTransaction.findMany({ where: { passOrderId, type: 'PASS_PRINT' } });
    if (!prints.length) return;
    if (await tx.partnerWalletTransaction.findFirst({ where: { passOrderId, type: 'REFUND' }, select: { id: true } })) return;
    const partnerIds = [...new Set(prints.map((p) => p.partnerId))].sort();
    await tx.$queryRaw`SELECT id FROM partners WHERE id IN (${Prisma.join(partnerIds)}) ORDER BY id FOR UPDATE`;
    const campaignIds = [...new Set(prints.map((p) => p.campaignId).filter(Boolean))].sort() as string[];
    if (campaignIds.length) await tx.$queryRaw`SELECT id FROM partner_campaigns WHERE id IN (${Prisma.join(campaignIds)}) ORDER BY id FOR UPDATE`;
    for (const p of prints) {
      const back = -p.amountPaise;
      const w = await tx.$queryRaw<{ walletBalancePaise: number }[]>`
        UPDATE partners SET "walletBalancePaise" = "walletBalancePaise" + ${back}, "totalSpentPaise" = "totalSpentPaise" - ${back}, "updatedAt" = now()
        WHERE id = ${p.partnerId} RETURNING "walletBalancePaise"`;
      if (p.campaignId) {
        await tx.$executeRaw`
          UPDATE partner_campaigns SET "passesPrinted" = "passesPrinted" - ${p.tokenCount}, "spentPaise" = "spentPaise" - ${back}, "updatedAt" = now()
          WHERE id = ${p.campaignId}`;
      }
      await tx.partnerWalletTransaction.create({
        data: {
          partnerId: p.partnerId, type: 'REFUND', amountPaise: back, balanceAfterPaise: w[0].walletBalancePaise, campaignId: p.campaignId,
          organizationId: p.organizationId, eventId: p.eventId, passOrderId, tokenCount: -p.tokenCount, note: why,
        },
      });
    }
  }

  /** Public view of the partner campaigns printed on a pass. */
  async printed(ids: string[], db: Db = this.prisma): Promise<PrintedPartner[]> {
    if (!ids.length) return [];
    const rows = await db.partnerCampaign.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, message: true, ratePaise: true, partner: { select: { id: true, name: true, tagline: true, websiteUrl: true, logoType: true, updatedAt: true } } },
    });
    return rows
      .sort((a, b) => b.ratePaise - a.ratePaise || a.partner.name.localeCompare(b.partner.name))
      .map((r) => ({
        id: r.id, partnerId: r.partner.id, name: r.partner.name, message: r.message, tagline: r.partner.tagline,
        websiteUrl: r.partner.websiteUrl, logoUrl: partnerLogoUrl(r.partner),
      }));
  }
}
