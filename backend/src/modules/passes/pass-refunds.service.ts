import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentProvider } from '../donations/payment-provider';
import { PushService } from '../push/push.service';
import { ReferralEarningsService } from '../referrals/referral-earnings.service';
import { rupees, toPaise } from '../billing/billing.service';
import { PASS_GATEWAYS } from './pass-gateways';

export interface CancelOrderInput {
  reason: string;
  /** Rupees; omitted = the default (everything for unused passes, see cancelOrder). */
  refund?: string;
  /** Gateway refund id / UPI / UTR when the refund was already sent outside Parvsetu. */
  refundReference?: string;
  /** Programme cancelled: refund everything, even for people already let in. */
  fullRefund?: boolean;
}

/**
 * Cancelling a PAID online pass order (organiser decision, or its ticketed
 * programme was cancelled). One transaction, under the order row lock:
 *
 *  - every unused pass of the order is cancelled (a used one stays USED);
 *  - PAID → CANCELLED with the refund amount, conditional, so a second cancel gets 409;
 *  - one negative PASS_REFUND settlement row: the platform returns its commission
 *    pro rata and the mandal's share is reduced by the rest, so the next payout
 *    nets it off (same as stall and competition refunds);
 *  - a refund on a tax invoice gets a GST credit note number from the event's own counter;
 *  - the blogger commission for the booking (if any) is reversed.
 *
 * After the commit the money goes back through the order's gateway when it can
 * refund (refundReference filled in); otherwise the refund stays "to send" until
 * the organiser records the reference (markRefunded). The buyer's phone is told.
 */
@Injectable()
export class PassRefundsService {
  private readonly log = new Logger(PassRefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly referrals: ReferralEarningsService,
    private readonly push: PushService,
    @Inject(PASS_GATEWAYS) private readonly gateways: PaymentProvider[],
  ) {}

  async cancelOrder(actorId: string | null, eventId: string, orderId: string, input: CancelOrderInput) {
    const reason = input.reason.trim();
    const out = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pass_orders WHERE id = ${orderId} FOR UPDATE`;
      const o = await tx.passOrder.findFirst({ where: { id: orderId, eventId }, include: { tokens: { select: { id: true, status: true, visitorCount: true } } } });
      if (!o) throw new NotFoundException('Booking not found');
      const ev = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true, name: true } });
      if (o.status !== 'PAID') throw new ConflictException({ statusCode: 409, code: 'ORDER_NOT_PAID', message: 'Only a paid booking can be cancelled.' });

      const amountPaise = toPaise(o.amount.toFixed(2));
      const usedPeople = o.tokens.filter((t) => t.status === 'USED').reduce((n, t) => n + t.visitorCount, 0);
      // People already let in were served: by default only the unused share comes back.
      const defaultPaise = input.fullRefund || usedPeople === 0 ? amountPaise : Math.round((amountPaise * Math.max(0, o.visitorCount - usedPeople)) / o.visitorCount);
      const refundPaise = input.refund === undefined ? defaultPaise : toPaise(input.refund);
      if (refundPaise > amountPaise) {
        throw new BadRequestException({ statusCode: 400, code: 'REFUND_TOO_HIGH', message: `The refund can't be more than the ₹${rupees(amountPaise)} paid.` });
      }

      const now = new Date();
      const reference = input.refundReference?.trim() || null;
      const moved = await tx.passOrder.updateMany({
        where: { id: o.id, status: 'PAID' },
        data: {
          status: 'CANCELLED', cancelledAt: now, cancelledById: actorId, cancelReason: reason, refundPaise,
          refundReference: refundPaise > 0 ? reference : null, refundedAt: refundPaise > 0 && reference ? now : null,
        },
      });
      if (moved.count !== 1) throw new ConflictException({ statusCode: 409, code: 'ORDER_NOT_PAID', message: 'Only a paid booking can be cancelled.' });
      const cancelled = await tx.token.updateMany({
        where: { passOrderId: o.id, status: 'ACTIVE' },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledById: actorId, cancellationReason: `Booking cancelled: ${reason}`.slice(0, 500) },
      });

      let creditNoteNo: string | null = null;
      if (refundPaise > 0) {
        const paid = await tx.paymentSettlement.findUnique({ where: { sourceId: o.id } });
        const share = (x: number) => Math.round((x * refundPaise) / amountPaise);
        const feeBack = share(paid?.commissionPaise ?? 0);
        await tx.paymentSettlement.create({
          data: {
            organizationId: ev.organizationId, eventId, sourceType: 'PASS_REFUND', sourceId: `refund:${o.id}`,
            grossPaise: -refundPaise, gatewayFeePaise: 0, commissionPaise: -feeBack, netPaise: -(refundPaise - feeBack), gstPaise: -share(toPaise(o.gstAmount.toFixed(2))),
          },
        });
        if (o.invoiceNo && o.gstAmount.gt(0)) {
          const [row] = await tx.$queryRaw<{ passCreditNoteSeq: number; tokenPrefix: string; startDate: Date }[]>`
            UPDATE events SET "passCreditNoteSeq" = "passCreditNoteSeq" + 1 WHERE id = ${eventId} RETURNING "passCreditNoteSeq", "tokenPrefix", "startDate"`;
          creditNoteNo = `${row.tokenPrefix}-PCN-${row.startDate.getUTCFullYear()}-${String(row.passCreditNoteSeq).padStart(5, '0')}`;
          await tx.passOrder.update({ where: { id: o.id }, data: { creditNoteNo } });
        }
      }
      await this.referrals.reverseForOrder(tx, o.id, { note: `Booking cancelled: ${reason}`.slice(0, 300), actorId });
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId, action: 'pass_order.cancelled', entityType: 'PassOrder', entityId: o.id,
        before: { status: 'PAID' },
        after: { status: 'CANCELLED', refund: rupees(refundPaise), refundReference: reference, creditNoteNo, passesCancelled: cancelled.count, usedPeople },
        reason,
      }, tx);
      return { order: o, refundPaise, reference, eventName: ev.name };
    });

    if (out.refundPaise > 0 && !out.reference) await this.refundThroughGateway(out.order, out.refundPaise);
    await this.push.sendToOrder(out.order.id, {
      title: `Booking cancelled — ${out.eventName}`,
      body: out.refundPaise > 0 ? `${reason} · Refund ₹${rupees(out.refundPaise)} to your payment method.` : reason,
      url: `/pass/${out.order.id}?k=${encodeURIComponent(out.order.accessKey)}`, tag: `pass-${out.order.id}`,
    });
    return out.order.id;
  }

  /**
   * Sends the refund through the gateway that took the payment, if it can. Never
   * throws: a failed gateway call leaves the refund "to send" for the organiser.
   */
  private async refundThroughGateway(o: { id: string; paymentProvider: string; paymentReference: string | null; providerOrderId: string | null }, refundPaise: number) {
    const gw = this.gateways.find((g) => g.key === o.paymentProvider);
    if (!gw?.refund) return;
    try {
      const r = await gw.refund({ reference: o.id, providerOrderId: o.providerOrderId, paymentReference: o.paymentReference, amount: rupees(refundPaise), currency: 'INR' });
      await this.prisma.passOrder.updateMany({ where: { id: o.id, refundReference: null }, data: { refundReference: r.refundReference, refundedAt: new Date() } });
    } catch (e) {
      this.log.warn(`Gateway refund for order ${o.id} failed: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
    }
  }

  /** The refund was sent outside Parvsetu: record its reference (once). */
  async markRefunded(actorId: string, eventId: string, orderId: string, reference: string) {
    const ref = reference.trim();
    await this.prisma.$transaction(async (tx) => {
      const o = await tx.passOrder.findFirst({ where: { id: orderId, eventId }, select: { id: true, refundPaise: true, refundReference: true } });
      if (!o) throw new NotFoundException('Booking not found');
      const moved = await tx.passOrder.updateMany({
        where: { id: orderId, status: 'CANCELLED', refundPaise: { gt: 0 }, refundReference: null },
        data: { refundReference: ref, refundedAt: new Date() },
      });
      if (moved.count !== 1) throw new ConflictException({ statusCode: 409, code: 'NO_REFUND_DUE', message: 'This booking has no refund waiting to be sent.' });
      const ev = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId, action: 'pass_order.refund_sent', entityType: 'PassOrder', entityId: orderId,
        after: { refund: rupees(o.refundPaise), refundReference: ref },
      }, tx);
    });
  }

  /**
   * A ticketed programme was cancelled: every paid booking for it is cancelled with
   * a full refund, unpaid checkouts are closed, and desk-issued tickets (no money
   * recorded) are cancelled. Safe to run again — it only touches what is still live,
   * so saving the programme as Cancelled again finishes a run that was cut short.
   */
  async cancelForProgramme(actorId: string, eventId: string, itemId: string, title: string, closeOrder: (orderId: string) => Promise<void>) {
    const reason = `Programme cancelled: ${title}`.slice(0, 500);
    const pending = await this.prisma.passOrder.findMany({ where: { eventId, programmeItemId: itemId, status: 'PENDING' }, select: { id: true } });
    for (const p of pending) await closeOrder(p.id);
    const paid = await this.prisma.passOrder.findMany({ where: { eventId, programmeItemId: itemId, status: 'PAID' }, select: { id: true } });
    let orders = 0;
    for (const p of paid) {
      try {
        await this.cancelOrder(actorId, eventId, p.id, { reason, fullRefund: true });
        orders++;
      } catch (e) {
        // Paid meanwhile by someone else's cancel: nothing left to do for it.
        if (!(e instanceof ConflictException)) throw e;
      }
    }
    const desk = await this.prisma.$transaction(async (tx) => {
      const r = await tx.token.updateMany({
        where: { eventId, programmeItemId: itemId, passOrderId: null, status: 'ACTIVE' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledById: actorId, cancellationReason: reason },
      });
      if (r.count) {
        const ev = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
        await this.audit.log({
          organizationId: ev.organizationId, eventId, actorId, action: 'token.cancelled_with_programme', entityType: 'ProgrammeItem', entityId: itemId,
          after: { count: r.count }, reason,
        }, tx);
      }
      return r.count;
    });
    return { ordersCancelled: orders, checkoutsClosed: pending.length, deskTicketsCancelled: desk };
  }

  /** Refund state for lists and the buyer's page. */
  static present(o: { status: string; cancelledAt: Date | null; cancelReason: string | null; refundPaise: number; refundReference: string | null; refundedAt: Date | null; creditNoteNo: string | null }) {
    if (o.status !== 'CANCELLED') return null;
    return {
      cancelledAt: o.cancelledAt, reason: o.cancelReason, amount: rupees(o.refundPaise),
      /** NONE = nothing refunded; TO_SEND = the organiser still has to send it; SENT = refundReference recorded. */
      state: o.refundPaise === 0 ? ('NONE' as const) : o.refundReference ? ('SENT' as const) : ('TO_SEND' as const),
      reference: o.refundReference, refundedAt: o.refundedAt, creditNoteNo: o.creditNoteNo,
    };
  }
}

export type PassRefundView = ReturnType<typeof PassRefundsService.present>;
