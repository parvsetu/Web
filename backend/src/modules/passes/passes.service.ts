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
import { dateOnly, formatInZone, slotWindow, ymd } from '../../common/time/validity';
import { TokensService } from '../tokens/tokens.service';
import { effectiveStatus } from '../tokens/token-presenter';
import { PaymentProvider } from '../donations/payment-provider';
import { PASS_GATEWAYS, demoPaymentsEnabled } from './pass-gateways';
import { SponsorsService } from '../sponsors/sponsors.service';
import { computeGst, slabRateBps } from '../../common/gst';
import { presentVenue, VENUE_SELECT } from '../../common/venue';
import { ORG_BRAND_SELECT, presentOrgBrand } from '../../common/org-brand';
import { decimalToPaise, effectivePrice, loadPricingRules, PricingRule, ticketPrice } from '../../common/pricing';
import { DateTime } from 'luxon';
import { BillingService, rupees } from '../billing/billing.service';
import { PartnerBillingService } from '../partners/partner-billing.service';
import { PayoutsService } from '../payouts/payouts.service';
import { CreatePassOrderDto, PassOrderListQuery } from './passes.dto';
import { LIVE_WHERE } from '../../common/event-approval';
import { presentSalesWindow, salesState } from '../../common/booking-window';
import { ReferralEarningsService } from '../referrals/referral-earnings.service';
import { PassRefundsService } from './pass-refunds.service';

/** How long an unpaid order holds its places. */
export const ORDER_HOLD_MINUTES = 15;

/** Public booking: the mandal switched it on, the event is running, and the platform made it LIVE (reviewed + fee paid). */
const BOOKABLE = { publicBookingEnabled: true, status: 'ACTIVE' as const, ...LIVE_WHERE };

const orderInclude = {
  event: { select: { id: true, name: true, festivalType: true, timezone: true, ...VENUE_SELECT, passInstructions: true, organizationId: true, gstSac: true, organization: { select: { name: true, ...ORG_BRAND_SELECT } } } },
  timeSlot: { select: { label: true } },
  programmeItem: { select: { id: true, title: true, date: true, startTime: true, endTime: true, stage: true } },
  tokens: {
    select: { tokenCode: true, secureToken: true, status: true, validFrom: true, validUntil: true, usedAt: true, visitorCount: true, sponsorIds: true, partnerCampaignIds: true },
    orderBy: { tokenCode: 'asc' as const },
  },
} as const;

type OrderRow = Prisma.PassOrderGetPayload<{ include: typeof orderInclude }>;

const ADMIN_INCLUDE = {
  timeSlot: { select: { label: true } }, programmeItem: { select: { title: true } },
  tokens: { select: { id: true, tokenCode: true, status: true }, orderBy: { tokenCode: 'asc' as const } },
  referralPromotion: { select: { code: true, blogger: { select: { name: true } } } },
} as const;

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
    private readonly partners: PartnerBillingService,
    private readonly referrals: ReferralEarningsService,
    private readonly refunds: PassRefundsService,
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
        id: true, organizationId: true, name: true, festivalType: true, description: true, ...VENUE_SELECT, startDate: true, endDate: true, timezone: true,
        maxVisitorsPerToken: true, bookingOpensAt: true, bookingClosesAt: true, organization: { select: { name: true, city: true, ...ORG_BRAND_SELECT } },
        timeSlots: { where: { isActive: true }, select: { price: true } },
      },
    });
    const verified = new Set(
      (await this.prisma.payoutAccount.findMany({ where: { status: 'VERIFIED', organizationId: { in: events.map((e) => e.organizationId) } }, select: { organizationId: true } })).map((p) => p.organizationId),
    );
    return events.map(({ timeSlots, organizationId, organization, bookingOpensAt, bookingClosesAt, ...e }) => ({
      ...e,
      ...presentSalesWindow({ bookingOpensAt, bookingClosesAt }),
      organization: presentOrgBrand(organization),
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
      include: { organization: { select: { name: true, city: true, ...ORG_BRAND_SELECT } } },
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
    const rules = await loadPricingRules(this.prisma, e.id);
    const tickets = await this.prisma.programmeItem.findMany({
      where: { eventId, ticketed: true, isPublished: true, endTime: { not: null } }, select: { id: true, date: true, ticketPrice: true },
    });
    return {
      id: e.id, name: e.name, festivalType: e.festivalType, description: e.description, location: e.location, state: e.state, city: e.city,
      venue: presentVenue(e),
      startDate: ymd(e.startDate), endDate: ymd(e.endDate), timezone: e.timezone, maxVisitorsPerToken: e.maxVisitorsPerToken,
      organization: presentOrgBrand(e.organization), onlinePayments: this.gateways.length > 0 && (await this.payouts.isVerified(e.organizationId)), holdMinutes: ORDER_HOLD_MINUTES,
      ...presentSalesWindow(e),
      // Slot prices here are BASE prices; the per-date effective price comes from availability().
      slots: slots.map((s) => ({ ...s, price: s.price.toFixed(2) })),
      /** Days on which at least one slot costs more than its base price (for "Peak" chips). */
      peakDates: peakDates(ymd(e.startDate), ymd(e.endDate), slots, tickets, rules),
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
    const rules = await loadPricingRules(this.prisma, e.id);
    // The day's published programme: ticketed items are sold on their own, the rest are what a day pass covers.
    const items = await this.prisma.programmeItem.findMany({
      where: { eventId, date: dateOnly(date), isPublished: true },
      orderBy: [{ startTime: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const itemWindow = (i: { startTime: string; endTime: string | null }) =>
      i.endTime ? slotWindow(date, i.startTime, i.endTime, e.timezone) : { validFrom: slotWindow(date, i.startTime, i.startTime, e.timezone).validFrom, validUntil: null };
    return {
      date,
      slots: await Promise.all(slots.map(async (s) => {
        const w = slotWindow(date, s.startTime, s.endTime, e.timezone);
        const ended = w.validUntil <= now;
        const p = effectivePrice(decimalToPaise(s.price), s.id, date, rules);
        return {
          id: s.id, label: s.label, startTime: s.startTime, endTime: s.endTime,
          /** Effective per-person price for this date (peak rules applied). */
          price: (p.pricePaise / 100).toFixed(2), basePrice: s.price.toFixed(2), ruleLabel: p.rule?.label ?? null,
          validFrom: w.validFrom, validUntil: w.validUntil, ended,
          remaining: ended ? 0 : await this.tokens.slotRemaining(s.id, w.validFrom, s.capacity),
          /** Programme on stage during this slot (not the separately ticketed items). */
          includes: items
            .filter((i) => !i.ticketed && i.status !== 'CANCELLED')
            .filter((i) => {
              const iw = itemWindow(i);
              return iw.validUntil ? iw.validFrom < w.validUntil && iw.validUntil > w.validFrom : iw.validFrom >= w.validFrom && iw.validFrom < w.validUntil;
            })
            .map((i) => i.title),
        };
      })),
      /** Programmes sold as their own ticket on this date. */
      tickets: await Promise.all(items.filter((i) => i.ticketed && i.endTime).map(async (i) => {
        const w = slotWindow(date, i.startTime, i.endTime!, e.timezone);
        const cancelled = i.status === 'CANCELLED';
        const ended = cancelled || w.validUntil <= now;
        const p = ticketPrice(decimalToPaise(i.ticketPrice), i.id, date, rules);
        return {
          id: i.id, label: i.title, startTime: i.startTime, endTime: i.endTime!, category: i.category, stage: i.stage,
          price: (p.pricePaise / 100).toFixed(2), basePrice: i.ticketPrice.toFixed(2), ruleLabel: p.rule?.label ?? null,
          validFrom: w.validFrom, validUntil: w.validUntil, ended, cancelled,
          remaining: ended ? 0 : await this.tokens.itemRemaining(i.id, i.ticketCapacity),
        };
      })),
    };
  }

  /** Online sales only inside the mandal's window (desk issuing is never limited by it). */
  private assertSalesOpen(e: { bookingOpensAt: Date | null; bookingClosesAt: Date | null; timezone: string }) {
    const state = salesState(e);
    if (state === 'OPEN') return;
    const when = (d: Date) => formatInZone(d, e.timezone);
    throw new ConflictException(state === 'NOT_YET'
      ? { statusCode: 409, code: 'SALES_NOT_OPEN', message: `Online passes go on sale on ${when(e.bookingOpensAt!)}.`, opensAt: e.bookingOpensAt }
      : { statusCode: 409, code: 'SALES_CLOSED', message: 'Online pass sales for this festival have closed. Passes may still be available at the venue.' });
  }

  private assertDateInEvent(e: { startDate: Date; endDate: Date }, date: string) {
    if (date < ymd(e.startDate) || date > ymd(e.endDate)) {
      throw new BadRequestException(`Choose a date between ${ymd(e.startDate)} and ${ymd(e.endDate)}.`);
    }
  }

  /** A day pass: the slot's window on the chosen date, peak rules applied (same decision as availability()). */
  private async slotTarget(event: { id: string; timezone: string }, timeSlotId: string, date: string) {
    const slot = await this.prisma.timeSlot.findFirst({ where: { id: timeSlotId, eventId: event.id, isActive: true } });
    if (!slot) throw new NotFoundException('Time slot not found');
    const window = slotWindow(date, slot.startTime, slot.endTime, event.timezone);
    if (window.validUntil <= new Date()) throw new BadRequestException('This time slot has already ended. Pick a later slot.');
    const price = effectivePrice(decimalToPaise(slot.price), slot.id, date, await loadPricingRules(this.prisma, event.id));
    return { kind: 'slot' as const, id: slot.id, capacity: slot.capacity, window, price, title: slot.label };
  }

  /** A programme ticket: only on the item's own date, valid for its start–end; peak rules for tickets applied. */
  private async ticketTarget(event: { id: string; timezone: string }, programmeItemId: string, date: string) {
    const item = await this.prisma.programmeItem.findFirst({ where: { id: programmeItemId, eventId: event.id, ticketed: true, isPublished: true } });
    if (!item || !item.endTime) throw new NotFoundException('This programme is not taking bookings.');
    if (ymd(item.date) !== date) throw new BadRequestException(`This programme is on ${ymd(item.date)}.`);
    if (item.status === 'CANCELLED') throw new BadRequestException('This programme has been cancelled.');
    const window = slotWindow(date, item.startTime, item.endTime, event.timezone);
    if (window.validUntil <= new Date()) throw new BadRequestException('This programme has already ended.');
    const price = ticketPrice(decimalToPaise(item.ticketPrice), item.id, date, await loadPricingRules(this.prisma, event.id));
    return { kind: 'item' as const, id: item.id, capacity: item.ticketCapacity, window, price, title: item.title };
  }

  // ─── Orders ──────────────────────────────────────────────────────────

  async createOrder(dto: CreatePassOrderDto) {
    const event = await this.bookableEvent(dto.eventId);
    this.assertSalesOpen(event);
    this.assertDateInEvent(event, dto.date);
    if (dto.visitorCount > event.maxVisitorsPerToken) {
      throw new BadRequestException(`One pass can admit at most ${event.maxVisitorsPerToken} people.`);
    }
    if (!dto.timeSlotId === !dto.programmeItemId) throw new BadRequestException('Choose a time slot or a programme.');
    const target = dto.programmeItemId ? await this.ticketTarget(event, dto.programmeItemId, dto.date) : await this.slotTarget(event, dto.timeSlotId!, dto.date);
    const w = target.window;
    const eff = target.price;
    const unitPrice = new Prisma.Decimal(eff.pricePaise).div(100);
    const price = unitPrice.mul(dto.visitorCount);
    const rateBps = event.gstEnabled
      ? slabRateBps(eff.pricePaise, {
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
    // Who referred this booking (approved promotion of THIS festival, active blogger, not self-referral).
    const referral = await this.referrals.resolveForOrder(this.prisma, event.id, dto.referralCode, { mobile: buyer.buyerMobile, email: buyer.buyerEmail });

    const orderId = await this.prisma.$transaction(async (tx) => {
      if (target.kind === 'slot') await this.tokens.checkSlotCapacity(tx, target.id, w.validFrom, target.capacity, dto.visitorCount);
      else await this.tokens.checkItemCapacity(tx, target.id, target.capacity, dto.visitorCount);
      const order = await tx.passOrder.create({
        data: {
          eventId: event.id,
          timeSlotId: target.kind === 'slot' ? target.id : null, programmeItemId: target.kind === 'item' ? target.id : null,
          validFrom: w.validFrom, validUntil: w.validUntil, visitorCount: dto.visitorCount,
          ...buyer, unitPrice, priceRuleLabel: eff.rule?.label ?? null, amount, paymentProvider: free ? 'free' : gateway!.key,
          baseAmount: new Prisma.Decimal(g.basePaise).div(100), gstAmount: new Prisma.Decimal(g.gstPaise).div(100),
          gstRateBps: g.gstPaise > 0 ? rateBps : 0, gstBearer: g.gstPaise > 0 ? event.gstBearer : null,
          perPersonPasses: dto.perPersonPasses ?? true,
          referralPromotionId: referral?.promotionId ?? null,
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
        // Paid orders: commission comes out of the payment split (the credit row still records the hold).
        includeCommission: free,
      });
      if (free) await this.markPaid(tx, order, null);
      return order.id;
    });

    if (gateway) {
      const payment = await gateway.createPayment({
        reference: orderId, amount: amount.toFixed(2), currency: 'INR', payerName: buyer.buyerName,
        description: target.kind === 'item' ? `Ticket — ${target.title} · ${event.name}` : `Pass — ${event.name}`,
      });
      await this.prisma.passOrder.update({ where: { id: orderId }, data: { providerOrderId: payment.providerOrderId } });
    }
    const order = await this.prisma.passOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    return { ...(await this.presentWithSponsors(order)), accessKey: order.accessKey, referral: referral ? { bloggerName: referral.bloggerName } : null };
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

  /** Adds the mandal's sponsors and the platform partners printed on this order's passes. */
  private async presentWithSponsors(o: OrderRow) {
    const ids = [...new Set(o.tokens.flatMap((t) => t.sponsorIds))];
    const partnerIds = [...new Set(o.tokens.flatMap((t) => t.partnerCampaignIds))];
    const ads = Math.max(0, ...o.tokens.map((t) => t.sponsorIds.length + t.partnerCampaignIds.length));
    const issuer = await this.payouts.receiptIdentity(o.event.organizationId);
    return {
      ...this.present(o), printedSponsors: await this.sponsors.byIds(ids), printedPartners: await this.partners.printed(partnerIds),
      printFormat: await this.billing.printFormat(this.prisma, o.event.organizationId, ads),
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
      return order.programmeItemId ? ('PAID_TICKET' as const) : undefined;
    });
    if (outcome === 'EXPIRED') {
      throw new ConflictException({ message: 'This booking expired before payment. Please book again.', code: 'ORDER_EXPIRED' });
    }
    // The programme was cancelled while the visitor was paying: the money goes straight back.
    if (outcome === 'PAID_TICKET') {
      const o = await this.prisma.passOrder.findUniqueOrThrow({ where: { id: orderId }, select: { eventId: true, programmeItem: { select: { title: true, status: true } } } });
      if (o.programmeItem?.status === 'CANCELLED') {
        await this.refunds.cancelOrder(null, o.eventId, orderId, { reason: `Programme cancelled: ${o.programmeItem.title}`, fullRefund: true }).catch(() => undefined);
      }
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
    // The order's own hold is excluded; everything else (tokens + other holds) still counts.
    if (order.timeSlotId) {
      const slot = await tx.timeSlot.findUniqueOrThrow({ where: { id: order.timeSlotId }, select: { capacity: true } });
      await this.tokens.checkSlotCapacity(tx, order.timeSlotId, order.validFrom, slot.capacity, order.visitorCount, order.id);
    } else {
      const item = await tx.programmeItem.findUniqueOrThrow({ where: { id: order.programmeItemId! }, select: { ticketCapacity: true } });
      await this.tokens.checkItemCapacity(tx, order.programmeItemId!, item.ticketCapacity, order.visitorCount, order.id);
    }
    const event = await tx.event.findUniqueOrThrow({ where: { id: order.eventId }, select: { id: true, tokenPrefix: true, startDate: true, organizationId: true } });
    const perPerson = order.perPersonPasses && order.visitorCount > 1;
    // Sponsors and platform partners chosen (and partners charged) at order time.
    const held = await tx.creditTransaction.findFirst({ where: { passOrderId: order.id, type: 'TOKEN_FEE' }, select: { sponsorIds: true, partnerCampaignIds: true } });
    const codes: string[] = [];
    for (let i = 0; i < (perPerson ? order.visitorCount : 1); i++) {
      const token = await this.tokens.mintToken(tx, event, {
        timeSlotId: order.timeSlotId, programmeItemId: order.programmeItemId, validFrom: order.validFrom, validUntil: order.validUntil,
        visitorCount: perPerson ? 1 : order.visitorCount, visitorName: order.buyerName, visitorMobile: order.buyerMobile,
        passOrderId: order.id, sponsorIds: held?.sponsorIds ?? [], partnerCampaignIds: held?.partnerCampaignIds ?? [],
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
    // Blogger commission: same transaction, order row locked, once per order (partial unique index).
    await this.referrals.onOrderPaid(tx, order);
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
      id: o.id, status: o.status, amount: o.amount.toFixed(2), unitPrice: o.unitPrice.toFixed(2), priceRuleLabel: o.priceRuleLabel, currency: o.currency,
      invoiceNo: o.invoiceNo,
      gst: o.gstAmount.gt(0)
        ? { taxable: o.baseAmount.toFixed(2), amount: o.gstAmount.toFixed(2), ratePercent: o.gstRateBps / 100, bearer: o.gstBearer, cgst: o.gstAmount.div(2).toFixed(2), sgst: o.gstAmount.minus(o.gstAmount.div(2).toDecimalPlaces(2)).toFixed(2), sac: o.event.gstSac }
        : null,
      visitorCount: o.visitorCount, buyerName: o.buyerName, buyerMobile: o.buyerMobile,
      validFrom: o.validFrom, validUntil: o.validUntil, expiresAt: o.expiresAt, paidAt: o.paidAt, createdAt: o.createdAt,
      payment: { provider: o.paymentProvider, demo: o.paymentProvider === 'demo' },
      /** Set when the organiser cancelled the booking (or its programme): refund amount and whether it was sent. */
      refund: PassRefundsService.present(o),
      event: { id: o.event.id, name: o.event.name, festivalType: o.event.festivalType, timezone: o.event.timezone, location: o.event.location, venue: presentVenue(o.event), passInstructions: o.event.passInstructions, organization: presentOrgBrand(o.event.organization) },
      // Programme tickets show the programme where older clients show the slot label.
      timeSlot: o.timeSlot ? { label: o.timeSlot.label } : o.programmeItem ? { label: o.programmeItem.title } : null,
      programme: o.programmeItem
        ? { id: o.programmeItem.id, title: o.programmeItem.title, date: ymd(o.programmeItem.date), startTime: o.programmeItem.startTime, endTime: o.programmeItem.endTime, stage: o.programmeItem.stage }
        : null,
    };
  }

  // ─── Admin ───────────────────────────────────────────────────────────

  async listForEvent(eventId: string, q: PassOrderListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.PassOrderWhereInput = {
      eventId, status: q.refundToSend === 'true' ? 'CANCELLED' : q.status,
      ...(q.refundToSend === 'true' ? { refundPaise: { gt: 0 }, refundReference: null } : {}),
      ...(q.q ? { OR: [{ buyerName: { contains: q.q, mode: 'insensitive' } }, { buyerMobile: { contains: q.q } }, { tokens: { some: { tokenCode: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const [rows, total, sum, cancelled, toSend] = await Promise.all([
      this.prisma.passOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: ADMIN_INCLUDE }),
      this.prisma.passOrder.count({ where }),
      this.prisma.passOrder.aggregate({ where: { eventId, status: 'PAID' }, _sum: { amount: true, visitorCount: true }, _count: { _all: true } }),
      // Cancelled bookings were paid: what they kept (amount − refund) is still revenue.
      this.prisma.passOrder.aggregate({ where: { eventId, status: 'CANCELLED' }, _sum: { amount: true, refundPaise: true }, _count: { _all: true } }),
      this.prisma.passOrder.aggregate({ where: { eventId, status: 'CANCELLED', refundPaise: { gt: 0 }, refundReference: null }, _sum: { refundPaise: true }, _count: { _all: true } }),
    ]);
    const refundedPaise = cancelled._sum.refundPaise ?? 0;
    const revenue = (sum._sum.amount ?? new Prisma.Decimal(0)).plus(cancelled._sum.amount ?? 0).minus(new Prisma.Decimal(refundedPaise).div(100));
    return {
      ...paged(
        rows.map((o) => this.presentAdmin(o)),
        total, page, pageSize,
      ),
      totals: {
        paidOrders: sum._count._all, revenue: revenue.toFixed(2), visitors: sum._sum.visitorCount ?? 0,
        cancelledOrders: cancelled._count._all, refunded: rupees(refundedPaise),
        refundsToSend: { count: toSend._count._all, amount: rupees(toSend._sum.refundPaise ?? 0) },
      },
    };
  }

  /** One booking as the organiser's list shows it (after a cancel / refund). */
  async adminOrder(eventId: string, orderId: string) {
    const o = await this.prisma.passOrder.findFirst({ where: { id: orderId, eventId }, include: ADMIN_INCLUDE });
    if (!o) throw new NotFoundException('Booking not found');
    return this.presentAdmin(o);
  }

  private presentAdmin(o: Prisma.PassOrderGetPayload<{ include: typeof ADMIN_INCLUDE }>) {
    return {
      id: o.id, status: o.status, buyerName: o.buyerName, buyerMobile: o.buyerMobile, visitorCount: o.visitorCount,
      amount: o.amount.toFixed(2), paymentProvider: o.paymentProvider, paymentReference: o.paymentReference,
      validFrom: o.validFrom, validUntil: o.validUntil, createdAt: o.createdAt, paidAt: o.paidAt,
      invoiceNo: o.invoiceNo, gst: o.gstAmount.toFixed(2),
      timeSlot: o.timeSlot ?? (o.programmeItem ? { label: o.programmeItem.title } : null),
      programme: o.programmeItem ? { title: o.programmeItem.title } : null,
      tokens: o.tokens, perPersonPasses: o.perPersonPasses,
      referral: o.referralPromotion ? { code: o.referralPromotion.code, bloggerName: o.referralPromotion.blogger.name } : null,
      refund: PassRefundsService.present(o),
    };
  }
}

/** Event days (max 400) where some slot's — or that day's ticketed programme's — effective price exceeds its base price. */
function peakDates(
  start: string, end: string, slots: { id: string; price: Prisma.Decimal }[], tickets: { id: string; date: Date; ticketPrice: Prisma.Decimal }[], rules: PricingRule[],
) {
  if (!rules.length) return [];
  const out: { date: string; label: string }[] = [];
  let d = DateTime.fromISO(start, { zone: 'utc' });
  const last = DateTime.fromISO(end, { zone: 'utc' });
  for (let i = 0; d <= last && i < 400; i++, d = d.plus({ days: 1 })) {
    const date = d.toISODate()!;
    const hit = [
      ...slots.map((s) => effectivePrice(decimalToPaise(s.price), s.id, date, rules)),
      ...tickets.filter((t) => ymd(t.date) === date).map((t) => ticketPrice(decimalToPaise(t.ticketPrice), t.id, date, rules)),
    ].find((p) => p.rule && p.pricePaise > p.basePaise);
    if (hit) out.push({ date, label: hit.rule!.label });
  }
  return out;
}
