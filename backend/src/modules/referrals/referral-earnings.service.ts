import { Injectable } from '@nestjs/common';
import { PassOrder, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { CommissionMode, commissionFor, normalizeCode, phoneKey } from './referral-rules';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Blogger referral ledger (referral_ledger_entries) — the money side of the
 * referral system, called from inside other modules' transactions:
 *
 *  - resolveForOrder: which approved promotion a referral code belongs to
 *    (this event, blogger ACTIVE, not the blogger buying with their own code).
 *  - onOrderPaid: in the PENDING → PAID transaction (order row locked), credits
 *    the commission once. INSERT … ON CONFLICT DO NOTHING against the partial
 *    unique index (one EARNED row per passOrderId, ever), so a replayed
 *    confirmation can't double-credit and a conflict never aborts the payment.
 *    Free bookings earn nothing — there was no payment.
 *  - reverseForOrder: one REVERSED row per commission (conditional update +
 *    partial unique index). Used when every pass of the booking is cancelled
 *    and by the super admin for a refund made outside Parvsetu.
 */
@Injectable()
export class ReferralEarningsService {
  constructor(private readonly billing: BillingService) {}

  /** The promotion a code attributes a new order to, or null (unknown code, other event, not live, self-referral). */
  async resolveForOrder(db: Db, eventId: string, rawCode: string | undefined, buyer: { mobile: string; email: string | null }) {
    const code = normalizeCode(rawCode);
    if (!code) return null;
    const p = await db.bloggerPromotion.findUnique({
      where: { code },
      select: { id: true, eventId: true, status: true, blogger: { select: { id: true, name: true, status: true, phone: true, email: true } } },
    });
    if (!p || p.eventId !== eventId || p.status !== 'APPROVED' || p.blogger.status !== 'ACTIVE') return null;
    const self = phoneKey(p.blogger.phone) === phoneKey(buyer.mobile) || (!!buyer.email && buyer.email === p.blogger.email.toLowerCase());
    return self ? null : { promotionId: p.id, bloggerName: p.blogger.name };
  }

  /** Commission terms for a promotion: its override, else the platform default. */
  async terms(db: Db, promotion: { commissionMode: string | null; commissionValue: number | null }) {
    if (promotion.commissionMode && promotion.commissionValue !== null) {
      return { mode: promotion.commissionMode as CommissionMode, value: promotion.commissionValue, custom: true };
    }
    const s = await this.billing.settings(db);
    return { mode: s.referralCommissionMode as CommissionMode, value: s.referralCommissionValue, custom: false };
  }

  async onOrderPaid(tx: Prisma.TransactionClient, order: PassOrder) {
    if (!order.referralPromotionId || !order.amount.gt(0)) return;
    const p = await tx.bloggerPromotion.findUnique({ where: { id: order.referralPromotionId }, include: { blogger: { select: { status: true } } } });
    // Revoked promotions and suspended bloggers stop earning, even for orders placed earlier.
    if (!p || p.status !== 'APPROVED' || p.blogger.status !== 'ACTIVE' || p.eventId !== order.eventId) return;
    const t = await this.terms(tx, p);
    const basePaise = Math.round(Number(order.baseAmount) * 100);
    const amount = commissionFor(t.mode, t.value, basePaise);
    if (amount <= 0) return;
    const note = t.mode === 'PERCENT' ? `${t.value / 100}% of ₹${(basePaise / 100).toFixed(2)}` : 'Fixed per booking';
    await tx.$executeRaw`
      INSERT INTO referral_ledger_entries (id, "bloggerId", type, kind, "amountPaise", "promotionId", "eventId", "passOrderId", note, "createdAt")
      VALUES (${randomUUID()}, ${p.bloggerId}, 'EARNED'::"ReferralLedgerType", 'COMMISSION', ${amount}, ${p.id}, ${p.eventId}, ${order.id}, ${note}, now())
      ON CONFLICT ("passOrderId") WHERE "type" = 'EARNED' DO NOTHING`;
  }

  /** Reverses the booking's commission (if any, once). Returns the reversed amount in paise (0 = nothing to reverse). */
  async reverseForOrder(tx: Prisma.TransactionClient, passOrderId: string, why: { note: string; actorId?: string | null }) {
    const e = await tx.referralLedgerEntry.findFirst({ where: { passOrderId, type: 'EARNED', reversedAt: null } });
    if (!e) return 0;
    return this.reverseEntry(tx, e, why);
  }

  async reverseEntry(tx: Prisma.TransactionClient, e: { id: string; bloggerId: string; amountPaise: number; promotionId: string | null; eventId: string | null; passOrderId: string | null }, why: { note: string; actorId?: string | null }) {
    const moved = await tx.referralLedgerEntry.updateMany({ where: { id: e.id, type: 'EARNED', reversedAt: null }, data: { reversedAt: new Date() } });
    if (moved.count !== 1) return 0;
    await tx.referralLedgerEntry.create({
      data: {
        bloggerId: e.bloggerId, type: 'REVERSED', kind: 'COMMISSION', amountPaise: e.amountPaise, promotionId: e.promotionId, eventId: e.eventId,
        passOrderId: e.passOrderId, reversesId: e.id, note: why.note, createdById: why.actorId ?? null,
      },
    });
    return e.amountPaise;
  }

  /**
   * A pass was cancelled (inside its transaction). When no pass of that booking
   * is left uncancelled, the booking is cancelled and its commission reversed.
   * The order row lock serializes two cancellations of the last two passes, so
   * the second one always sees the first and reverses.
   */
  async onPassCancelled(tx: Prisma.TransactionClient, passOrderId: string | null, actorId: string) {
    if (!passOrderId) return;
    await tx.$queryRaw`SELECT id FROM pass_orders WHERE id = ${passOrderId} FOR UPDATE`;
    const live = await tx.token.count({ where: { passOrderId, status: { not: 'CANCELLED' } } });
    if (live === 0) await this.reverseForOrder(tx, passOrderId, { note: 'Booking cancelled (all passes cancelled)', actorId });
  }

  /** earned (net of reversals) / reversed / paid / due for one blogger, in paise. */
  async totals(bloggerId: string, db: Db) {
    const g = await db.referralLedgerEntry.groupBy({ by: ['type'], where: { bloggerId }, _sum: { amountPaise: true } });
    const sum = (t: string) => g.find((x) => x.type === t)?._sum.amountPaise ?? 0;
    const earned = sum('EARNED') - sum('REVERSED');
    return { earnedPaise: earned, grossEarnedPaise: sum('EARNED'), reversedPaise: sum('REVERSED'), paidPaise: sum('PAID'), duePaise: earned - sum('PAID') };
  }
}
