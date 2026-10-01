import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Field-agent earnings ledger (agent_ledger_entries).
 *
 *  - REGISTRATION referral: a fixed amount (agent override, else platform default),
 *    EARNED when the referred mandal pays an event fee and it has no live referral
 *    yet — i.e. on its first paid fee, so empty registrations earn nothing.
 *  - COMMISSION: % of every paid event fee (agent override, else default, default 0%).
 *
 * Called inside the payment transaction, after the payment and event rows are
 * locked; the mandal row is locked here (FOR UPDATE), so two simultaneous fee
 * payments of one mandal serialize. Partial unique indexes are the backstop:
 * inserts use ON CONFLICT DO NOTHING, never a failing insert that would abort
 * the payment. Suspended agents don't earn.
 */
@Injectable()
export class AgentEarningsService {
  constructor(private readonly billing: BillingService) {}

  async onFeePaid(tx: Prisma.TransactionClient, p: { organizationId: string; eventId: string; paymentId: string; amountPaise: number }) {
    const rows = await tx.$queryRaw<{ agentId: string | null }[]>`SELECT "agentId" FROM organizations WHERE id = ${p.organizationId} FOR UPDATE`;
    const agentId = rows[0]?.agentId;
    if (!agentId) return;
    const agent = await tx.agent.findUnique({ where: { id: agentId } });
    if (!agent || agent.status !== 'ACTIVE') return;
    const s = await this.billing.settings(tx);

    const referral = agent.referralFeePaise ?? s.agentReferralFeePaise;
    const live = await tx.agentLedgerEntry.findFirst({ where: { organizationId: p.organizationId, kind: 'REGISTRATION', type: 'EARNED', reversedAt: null }, select: { id: true } });
    if (!live && referral > 0) {
      await tx.$executeRaw`
        INSERT INTO agent_ledger_entries (id, "agentId", type, kind, "amountPaise", "organizationId", "eventId", "eventFeePaymentId", note, "createdAt")
        VALUES (${randomUUID()}, ${agentId}, 'EARNED'::"AgentLedgerType", 'REGISTRATION', ${referral}, ${p.organizationId}, ${p.eventId}, ${p.paymentId}, 'Mandal referral (first paid event fee)', now())
        ON CONFLICT ("organizationId") WHERE "kind" = 'REGISTRATION' AND "type" = 'EARNED' AND "reversedAt" IS NULL DO NOTHING`;
    }
    const bps = agent.commissionBps ?? s.agentCommissionBps;
    const commission = Math.round((p.amountPaise * bps) / 10000);
    if (commission > 0) {
      await tx.$executeRaw`
        INSERT INTO agent_ledger_entries (id, "agentId", type, kind, "amountPaise", "organizationId", "eventId", "eventFeePaymentId", note, "createdAt")
        VALUES (${randomUUID()}, ${agentId}, 'EARNED'::"AgentLedgerType", 'COMMISSION', ${commission}, ${p.organizationId}, ${p.eventId}, ${p.paymentId}, ${`${bps / 100}% of event fee`}, now())
        ON CONFLICT ("eventFeePaymentId") WHERE "kind" = 'COMMISSION' AND "type" = 'EARNED' DO NOTHING`;
    }
  }

  /** A refunded fee reverses what it earned (its commission, and the referral if this payment earned it). */
  async onFeeRefunded(tx: Prisma.TransactionClient, p: { organizationId: string; paymentId: string; actorId: string }) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${p.organizationId} FOR UPDATE`;
    const earned = await tx.agentLedgerEntry.findMany({ where: { eventFeePaymentId: p.paymentId, type: 'EARNED', reversedAt: null } });
    for (const e of earned) {
      await tx.agentLedgerEntry.update({ where: { id: e.id }, data: { reversedAt: new Date() } });
      await tx.agentLedgerEntry.create({
        data: {
          agentId: e.agentId, type: 'REVERSED', kind: e.kind, amountPaise: e.amountPaise, organizationId: e.organizationId, eventId: e.eventId,
          eventFeePaymentId: e.eventFeePaymentId, reversesId: e.id, note: 'Event fee refunded', createdById: p.actorId,
        },
      });
    }
  }

  /** earned (net of reversals) / paid / due for one agent, in paise. */
  async totals(agentId: string, db: Db) {
    const g = await db.agentLedgerEntry.groupBy({ by: ['type'], where: { agentId }, _sum: { amountPaise: true } });
    const sum = (t: string) => g.find((x) => x.type === t)?._sum.amountPaise ?? 0;
    const earned = sum('EARNED') - sum('REVERSED');
    return { earnedPaise: earned, grossEarnedPaise: sum('EARNED'), reversedPaise: sum('REVERSED'), paidPaise: sum('PAID'), duePaise: earned - sum('PAID') };
  }
}
