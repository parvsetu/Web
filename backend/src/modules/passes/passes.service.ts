import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { PassOrder, Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { QrSigner } from '../../common/qr/qr-signer';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging } from '../../common/http';
import { slotWindow, ymd } from '../../common/time/validity';
import { TokensService } from '../tokens/tokens.service';
import { effectiveStatus } from '../tokens/token-presenter';
import { PaymentProvider } from '../donations/payment-provider';
import { PASS_GATEWAYS, demoPaymentsEnabled } from './pass-gateways';
import { SponsorsService } from '../sponsors/sponsors.service';
import { computeGst, slabRateBps } from '../../common/gst';
import { BillingService } from '../billing/billing.service';
import { PayoutsService } from '../payouts/payouts.service';
import { CreatePassOrderDto, PassOrderListQuery } from './passes.dto';

/** How long an unpaid order holds its places. */
export const ORDER_HOLD_MINUTES = 15;

const BOOKABLE = { publicBookingEnabled: true, status: 'ACTIVE' as const };

const orderInclude = {
  event: { select: { id: true, name: true, festivalType: true, timezone: true, location: true, organizationId: true, gstSac: true, passPrintFormat: true, organization: { select: { name: true } } } },
  timeSlot: { select: { label: true } },
  tokens: {
    select: { tokenCode: true, secureToken: true, status: true, validFrom: true, validUntil: true, usedAt: true, visitorCount: true, sponsorIds: true },
    orderBy: { tokenCode: 'asc' as const },
  },
} as const;

type OrderRow = Prisma.PassOrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Public pass booking. Visitors need no account: an order is read back with
 * its random accessKey. Money and capacity rules live here, never in the
 * frontend: the price comes from the slot, capacity is checked under the same
 * slot row lock every other issuer uses, and a paid order mints exactly one
 * set of passes (minted under the order's row lock, only on PENDING → PAID):
 * one single-entry QR per person, or one group QR admitting visitorCount.
 */
@Injectable()
export class PassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tokens: TokensService,
    private readonly qr: QrSigner,
    private readonly sponsors: SponsorsService,
    private readonly billing: BillingService,
    private readonly payouts: PayoutsService,
    @Inject(PASS_GATEWAYS) private readonly gateways: PaymentProvider[],
  ) {}

  // ─── Public catalogue ────────────────────────────────────────────────

  async bookableEvents(filter: { state?: string; city?: string; q?: string } = {}) {
    const events = await this.prisma.event.findMany({
      where: {
        ...BOOKABLE,
        state: filter.state || undefined,
        city: filter.city ? { equals: filter.city, mode: 'insensitive' } : undefined,
        ...(filter.q ? { OR: [{ name: { contains: filter.q, mode: 'insensitive' } }, { organization: { name: { contains: filter.q, mode: 'insensitive' } } }] } : {}),
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true, organizationId: true, name: true, festivalType: true, description: true, location: true, state: true, city: true, startDate: true, endDate: true, timezone: true,
        maxVisitorsPerToken: true, organization: { select: { name: true, city: true } },
        timeSlots: { where: { isActive: true }, select: { price: true } },
      },
    });
    const verified = new Set(
      (await this.prisma.payoutAccount.findMany({ where: { status: 'VERIFIED', organizationId: { in: events.map((e) => e.organizationId) } }, select: { organizationId: true } })).map((p) => p.organizationId),
    );
    return events.map(({ timeSlots, organizationId, ...e }) => ({
      ...e,
      startDate: ymd(e.startDate),
      endDate: ymd(e.endDate),
      fromPrice: timeSlots.length ? Prisma.Decimal.min(...timeSlots.map((s) => s.price)).toFixed(2) : null,
      // Paid passes need a gateway AND a verified payout account (the mandal's share goes there).
      onlinePayments: this.gateways.length > 0 && verified.has(organizationId),
    }));
  }

  private async bookableEvent(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, ...BOOKABLE },
      include: { organization: { select: { name: true, city: true } } },
    });
    if (!event) throw new NotFoundException('This festival is not taking bookings.');
    return event;
  }

  async eventForBooking(eventId: string) {
    const e = await this.bookableEvent(eventId);
    const slots = await this.prisma.timeSlot.findMany({
      where: { eventId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
      select: { id: true, label: true, startTime: true, endTime: true, price: true, capacity: true },
    });
    return {
      id: e.id, name: e.name, festivalType: e.festivalType, description: e.description, location: e.location, state: e.state, city: e.city,
      startDate: ymd(e.startDate), endDate: ymd(e.endDate), timezone: e.timezone, maxVisitorsPerToken: e.maxVisitorsPerToken,
      organization: e.organization, onlinePayments: this.gateways.length > 0 && (await this.payouts.isVerified(e.organizationId)), holdMinutes: ORDER_HOLD_MINUTES,
      slots: slots.map((s) => ({ ...s, price: s.price.toFixed(2) })),
      gst: e.gstEnabled
        ? {
            ratePercent: e.gstRateBps / 100, bearer: e.gstBearer, mode: e.gstMode,
            lowRatePercent: e.gstLowRateBps / 100, threshold: (e.gstSlabThresholdPaise / 100).toFixed(2),
          }
        : null,
      sponsors: await this.sponsors.forEvent(e.id),
    };
  }

  /** Per-slot price and remaining places for one date. */
  async availability(eventId: string, date: string) {
    const e = await this.bookableEvent(eventId);
    this.assertDateInEvent(e, date);
    const slots = await this.prisma.timeSlot.findMany({
      where: { eventId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }],
    });
    const now = new Date();
    return {
      date,
      slots: await Promise.all(slots.map(async (s) => {
        const w = slotWindow(date, s.startTime, s.endTime, e.timezone);
        const ended = w.validUntil <= now;
        return {
          id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime, price: s.price.toFixed(2),
          validFrom: w.validFrom, validUntil: w.validUntil, ended,
          remaining: ended ? 0 : await this.tokens.slotRemaining(s.id, w.validFrom, s.capacity),
        };
      })),
    };
  }

  private assertDateInEvent(e: { startDate: Date; endDate: Date }, date: string) {
    if (date < ymd(e.startDate) || date > ymd(e.endDate)) {
      throw new BadRequestException(`Choose a date between ${ymd(e.startDate)} and ${ymd(e.endDate)}.`);
    }
  }

  // ─── Orders ──────────────────────────────────────────────────────────

  async createOrder(dto: CreatePassOrderDto) {
    const event = await this.bookableEvent(dto.eventId);
    this.assertDateInEvent(event, dto.date);
    if (dto.visitorCount > event.maxVisitorsPerToken) {
      throw new BadRequestException(`One pass can admit at most ${event.maxVisitorsPerToken} people.`);
    }
    const slot = await this.prisma.timeSlot.findFirst({ where: { id: dto.timeSlotId, eventId: event.id, isActive: true } });
    if (!slot) throw new NotFoundException('Time slot not found');
    const w = slotWindow(dto.date, slot.startTime, slot.endTime, event.timezone);
    if (w.validUntil <= new Date()) throw new BadRequestException('This time slot has already ended. Pick a later slot.');

    const price = slot.price.mul(dto.visitorCount);
    const rateBps = event.gstEnabled
      ? slabRateBps(Math.round(Number(slot.price) * 100), {
          mode: event.gstMode as 'FLAT' | 'SLAB', rateBps: event.gstRateBps, lowRateBps: event.gstLowRateBps,
          thresholdPaise: event.gstSlabThresholdPaise, bearer: event.gstBearer as 'CUSTOMER' | 'MANDAL',
        })
      : 0;
    const g = computeGst(Math.round(Number(price) * 100), rateBps, event.gstBearer as 'CUSTOMER' | 'MANDAL');
    const amount = new Prisma.Decimal(g.totalPaise).div(100);
    const free = amount.isZero();
    const gateway = free ? null : this.gateways[0];
    if (!free && !gateway) throw new ServiceUnavailableException('Online payment is not set up for this festival yet.');
    if (!free && !(await this.payouts.isVerified(event.organizationId))) {
      throw new ConflictException({ message: 'This mandal cannot accept online payments yet (payout account not verified). Free passes are still available.', code: 'PAYOUTS_NOT_READY' });
    }

    const buyer = {
      buyerName: dto.buyerName.trim(),
      buyerMobile: normalizeMobile(dto.buyerMobile),
      buyerEmail: normalizeEmail(dto.buyerEmail),
    };

    const orderId = await this.prisma.$transaction(async (tx) => {
      await this.tokens.checkSlotCapacity(tx, slot.id, w.validFrom, slot.capacity, dto.visitorCount);
      const order = await tx.passOrder.create({
        data: {
          eventId: event.id, timeSlotId: slot.id, validFrom: w.validFrom, validUntil: w.validUntil, visitorCount: dto.visitorCount,
          ...buyer, unitPrice: slot.price, amount, paymentProvider: free ? 'free' : gateway!.key,
          baseAmount: new Prisma.Decimal(g.basePaise).div(100), gstAmount: new Prisma.Decimal(g.gstPaise).div(100),
          gstRateBps: g.gstPaise > 0 ? rateBps : 0, gstBearer: g.gstPaise > 0 ? event.gstBearer : null,
          perPersonPasses: dto.perPersonPasses ?? true,
          accessKey: randomBytes(24).toString('base64url'),
          expiresAt: new Date(Date.now() + ORDER_HOLD_MINUTES * 60_000),
        },
      });
      // The mandal's commission is held now (refunded if payment fails/expires),
      // so a paid visitor can never be left without a pass for lack of credit.
      const perPerson = order.perPersonPasses && order.visitorCount > 1;
      await this.billing.charge(tx, {
        organizationId: event.organizationId, eventId: event.id, tokenCount: perPerson ? order.visitorCount : 1,
        personCount: order.visitorCount, source: 'ONLINE', passOrderId: order.id, reference: `Online order ${order.id.slice(0, 8)}`,
        // Paid orders: commission comes out of the payment split; credit covers only partner printing.
        includeCommission: free,
      });
      if (free) await this.markPaid(tx, order, null);
      return order.id;
    });

    if (gateway) {
      const payment = await gateway.createPayment({
        reference: orderId, amount: amount.toFixed(2), currency: 'INR', payerName: buyer.buyerName, description: `Pass — ${event.name}`,
      });
      await this.prisma.passOrder.update({ where: { id: orderId }, data: { providerOrderId: payment.providerOrderId } });
    }
    const order = await this.prisma.passOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    return { ...(await this.presentWithSponsors(order)), accessKey: order.accessKey };
  }

  /** The buyer's view. Unknown id and wrong key are indistinguishable (404). */
  async getOrder(orderId: string, key: string) {
    let order = await this.load(orderId, key);
    if (order.status === 'PENDING' && order.expiresAt <= new Date()) {
      await this.closeOrder(order.id, 'EXPIRED');
      order = await this.load(orderId, key);
    }
    return this.presentWithSponsors(order);
  }

  /** Adds the partners printed on this order's passes (paid promotion). */
  private async presentWithSponsors(o: OrderRow) {
    const ids = [...new Set(o.tokens.flatMap((t) => t.sponsorIds))];
    const issuer = await this.payouts.receiptIdentity(o.event.organizationId);
    return {
      ...this.present(o), printedSponsors: await this.sponsors.byIds(ids), printFormat: o.event.passPrintFormat,
      issuer: issuer ? { legalName: issuer.legalName, gstin: issuer.gstin, address: issuer.address } : null,
    };
  }

  async demoPay(orderId: string, key: string, outcome: 'success' | 'fail') {
    if (!demoPaymentsEnabled()) throw new NotFoundException('Not found');
    const order = await this.load(orderId, key);
    if (order.paymentProvider !== 'demo') throw new BadRequestException('This order is not a demo payment.');
    if (outcome === 'fail') {
      await this.closeOrder(order.id, 'FAILED');
    } else {
      await this.confirmPayment(order.id, `demo_pay_${randomBytes(6).toString('hex')}`);
    }
    return this.getOrder(orderId, key);
  }

  /**
   * Payment captured → mint the pass. Idempotent (a replayed confirmation
   * returns the same pass) and serialized on the order row, so two
   * confirmations can never mint two tokens.
   */
  async confirmPayment(orderId: string, paymentReference: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM pass_orders WHERE id = ${orderId} FOR UPDATE`;
      const order = await tx.passOrder.findUniqueOrThrow({ where: { id: orderId } });
      if (order.status === 'PAID') return;
      if (order.status !== 'PENDING') {
        throw new ConflictException({ message: 'This booking is no longer open. Please book again.', code: 'ORDER_CLOSED' });
      }
      if (order.expiresAt <= new Date()) {
        await tx.passOrder.update({ where: { id: order.id }, data: { status: 'EXPIRED' } });
        await this.billing.refundOrder(tx, order.id, 'Order expired before payment');
        return 'EXPIRED' as const;
      }
      await this.markPaid(tx, order, paymentReference);
    });
    if (outcome === 'EXPIRED') {
      throw new ConflictException({ message: 'This booking expired before payment. Please book again.', code: 'ORDER_EXPIRED' });
    }
  }

  /** PENDING → FAILED/EXPIRED exactly once, returning the held commission. */
  async closeOrder(orderId: string, status: 'FAILED' | 'EXPIRED') {
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.passOrder.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status } });
      if (moved.count === 1) await this.billing.refundOrder(tx, orderId, status === 'FAILED' ? 'Payment failed' : 'Order expired before payment');
    });
  }

  /** Expires abandoned checkouts so their places and held credit come back. */
  async sweepExpired() {
    const stale = await this.prisma.passOrder.findMany({ where: { status: 'PENDING', expiresAt: { lte: new Date() } }, select: { id: true }, take: 200 });
    for (const o of stale) await this.closeOrder(o.id, 'EXPIRED');
    return stale.length;
  }

  private sweeper?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      this.sweeper = setInterval(() => void this.sweepExpired().catch(() => undefined), 60_000);
    }
  }
  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private async markPaid(tx: Prisma.TransactionClient, order: PassOrder, paymentReference: string | null) {
    const slot = await tx.timeSlot.findUniqueOrThrow({ where: { id: order.timeSlotId }, select: { capacity: true } });
    // The order's own hold is excluded; everything else (tokens + other holds) still counts.
    await this.tokens.checkSlotCapacity(tx, order.timeSlotId, order.validFrom, slot.capacity, order.visitorCount, order.id);
    const event = await tx.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { id: true, tokenPrefix: true, startDate: true, organizationId: true } });
    const perPerson = order.perPersonPasses && order.visitorCount > 1;
    // Partners paid for at order time (fee held with the commission).
    const held = await tx.creditTransaction.findFirst({ where: { passOrderId: order.id, type: 'TOKEN_FEE' }, select: { sponsorIds: true } });
    const codes: string[] = [];
    for (let i = 0; i < (perPerson ? order.visitorCount : 1); i++) {
      const token = await this.tokens.mintToken(tx, event, {
        timeSlotId: order.timeSlotId, validFrom: order.validFrom, validUntil: order.validUntil,
        visitorCount: perPerson ? 1 : order.visitorCount, visitorName: order.buyerName, visitorMobile: order.buyerMobile,
        passOrderId: order.id, sponsorIds: held?.sponsorIds ?? [],
      });
      codes.push(token.tokenCode);
    }
    // Every paid order gets a sequential invoice number (a tax invoice when GST applies).
    let invoiceNo: string | null = null;
    if (order.amount.gt(0)) {
      const seq = await tx.$queryRaw<{ passInvoiceSeq: number; tokenPrefix: string; startDate: Date }[]>`
        UPDATE events SET "passInvoiceSeq" = "passInvoiceSeq" + 1 WHERE id = ${order.eventId}
        RETURNING "passInvoiceSeq", "tokenPrefix", "startDate"`;
      invoiceNo = `${seq[0].tokenPrefix}-INV-${seq[0].startDate.getUTCFullYear()}-${String(seq[0].passInvoiceSeq).padStart(5, '0')}`;
    }
    await tx.passOrder.update({
      where: { id: order.id },
      data: { status: 'PAID', paidAt: new Date(), paymentReference, invoiceNo },
    });
    if (order.amount.gt(0)) {
      const r = await this.billing.rates(tx, event.organizationId);
      await this.payouts.recordSettlement(tx, {
        organizationId: event.organizationId, eventId: event.id, sourceType: 'PASS_ORDER', sourceId: order.id,
        grossPaise: Math.round(Number(order.amount) * 100), commissionPaise: r.unitFeePaise * order.visitorCount,
        gstPaise: Math.round(Number(order.gstAmount) * 100),
      });
    }
    await this.audit.log({
      organizationId: event.organizationId, eventId: event.id, action: 'pass.paid', entityType: 'PassOrder', entityId: order.id,
      after: { tokenCodes: codes, amount: order.amount.toFixed(2), visitorCount: order.visitorCount, provider: order.paymentProvider },
    }, tx);
  }

  private async load(orderId: string, key: string): Promise<OrderRow> {
    const order = await this.prisma.passOrder.findUnique({ where: { id: orderId }, include: orderInclude }).catch(() => null);
    const a = Buffer.from(order?.accessKey ?? 'x'.repeat(32));
    const b = Buffer.from(key ?? '');
    if (!order || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Booking not found');
    return order;
  }

  private present(o: OrderRow) {
    const passes = o.tokens.map((t) => ({
      tokenCode: t.tokenCode,
      qrPayload: this.qr.payloadFor(t.secureToken),
      status: effectiveStatus(t),
      usedAt: t.usedAt,
      admits: t.visitorCount,
    }));
    return {
      perPersonPasses: o.perPersonPasses,
      passes,
      /** First pass — kept for clients that show a single QR. */
      pass: passes[0] ?? null,
      id: o.id, status: o.status, amount: o.amount.toFixed(2), unitPrice: o.unitPrice.toFixed(2), currency: o.currency,
      invoiceNo: o.invoiceNo,
      gst: o.gstAmount.gt(0)
        ? { taxable: o.baseAmount.toFixed(2), amount: o.gstAmount.toFixed(2), ratePercent: o.gstRateBps / 100, bearer: o.gstBearer, cgst: o.gstAmount.div(2).toFixed(2), sgst: o.gstAmount.minus(o.gstAmount.div(2).toDecimalPlaces(2)).toFixed(2), sac: o.event.gstSac }
        : null,
      visitorCount: o.visitorCount, buyerName: o.buyerName, buyerMobile: o.buyerMobile,
      validFrom: o.validFrom, validUntil: o.validUntil, expiresAt: o.expiresAt, paidAt: o.paidAt, createdAt: o.createdAt,
      payment: { provider: o.paymentProvider, demo: o.paymentProvider === 'demo' },
      event: { id: o.event.id, name: o.event.name, festivalType: o.event.festivalType, timezone: o.event.timezone, location: o.event.location, organization: o.event.organization },
      timeSlot: { label: o.timeSlot.label },
    };
  }

  // ─── Admin ───────────────────────────────────────────────────────────

  async listForEvent(eventId: string, q: PassOrderListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.PassOrderWhereInput = {
      eventId, status: q.status,
      ...(q.q ? { OR: [{ buyerName: { contains: q.q, mode: 'insensitive' } }, { buyerMobile: { contains: q.q } }, { tokens: { some: { tokenCode: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [rows, total, sum] = await Promise.all([
      this.prisma.passOrder.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: { timeSlot: { select: { label: true } }, tokens: { select: { id: true, tokenCode: true, status: true }, orderBy: { tokenCode: 'asc' } } },
      }),
      this.prisma.passOrder.count({ where }),
      this.prisma.passOrder.aggregate({ where: { eventId, status: 'PAID' }, _sum: { amount: true, visitorCount: true }, _count: { _all: true } }),
    ]);
    return {
      ...paged(
        rows.map((o) => ({
          id: o.id, status: o.status, buyerName: o.buyerName, buyerMobile: o.buyerMobile, visitorCount: o.visitorCount,
          amount: o.amount.toFixed(2), paymentProvider: o.paymentProvider, paymentReference: o.paymentReference,
          validFrom: o.validFrom, validUntil: o.validUntil, createdAt: o.createdAt, paidAt: o.paidAt,
          timeSlot: o.timeSlot, tokens: o.tokens, perPersonPasses: o.perPersonPasses,
        })),
        total, page, pageSize,
      ),
      totals: { paidOrders: sum._count._all, revenue: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), visitors: sum._sum.visitorCount ?? 0 },
    };
  }
}
