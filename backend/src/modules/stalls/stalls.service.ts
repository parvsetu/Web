import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, StallBooking, StallType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { todayIn, ymd } from '../../common/time/validity';
import { LIVE_WHERE } from '../../common/event-approval';
import { presentVenue, VENUE_SELECT } from '../../common/venue';
import { BillingService, rupees, toPaise } from '../billing/billing.service';
import { PayoutsService } from '../payouts/payouts.service';
import { PaymentProvider } from '../donations/payment-provider';
import { PASS_GATEWAYS, demoPaymentsEnabled } from '../passes/pass-gateways';
import {
  CreateStallBookingDto, CreateStallTypeDto, StallBookingListQuery, StallSettingsDto, UpdateStallBookingDto, UpdateStallTypeDto, VendorBookingQuery, VendorFestivalQuery,
} from './stalls.dto';
import { MAX_OPEN_BOOKINGS_PER_VENDOR, STALL_HOLD_MINUTES, quoteStalls } from './stalls.rules';
import { VendorCtx } from './vendor.guard';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

/** Festivals where vendors may book: live, running or upcoming, booking switched on. */
const OPEN_EVENT = { ...LIVE_WHERE, status: 'ACTIVE' as const, stallBookingEnabled: true };

const bookingInclude = {
  stallType: { select: { id: true, name: true, category: true, size: true } },
  event: { select: { id: true, name: true, startDate: true, endDate: true, timezone: true, tokenPrefix: true, ...VENUE_SELECT, organization: { select: { id: true, name: true } } } },
} as const;
type BookingRow = Prisma.StallBookingGetPayload<{ include: typeof bookingInclude }>;

/** Holds = paid bookings + unpaid ones still inside their payment window. */
const holdingWhere = (now = new Date()): Prisma.StallBookingWhereInput => ({ OR: [{ status: 'PAID' }, { status: 'PENDING', expiresAt: { gt: now } }] });

function presentType(t: StallType, taken: number) {
  return {
    id: t.id, name: t.name, category: t.category, description: t.description, size: t.size,
    price: rupees(t.pricePaise), totalCount: t.totalCount, booked: taken, available: Math.max(0, t.totalCount - taken),
    isActive: t.isActive, sortOrder: t.sortOrder,
  };
}

/**
 * Stall booking. A mandal sets stall types (count + price) on a festival and
 * switches booking on; a vendor (own login) books N stalls of a type and pays
 * online. Overselling is impossible: every hold is checked under a row lock on
 * the stall type, counting paid bookings plus unexpired unpaid ones. On
 * payment the platform keeps the mandal's stall commission through the normal
 * PaymentSettlement split (sourceType STALL_BOOKING), so it shows up in
 * billing & earnings and in the mandal's settlements/payouts.
 */
@Injectable()
export class StallsService implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly payouts: PayoutsService,
    @Inject(PASS_GATEWAYS) private readonly gateways: PaymentProvider[],
  ) {}

  // ─── Availability ───────────────────────────────────────────────────

  /** stallTypeId → stalls held (paid + unexpired pending), optionally excluding one booking. */
  private async taken(db: Db, typeIds: string[], excludeBookingId?: string) {
    if (!typeIds.length) return new Map<string, number>();
    const rows = await db.stallBooking.groupBy({
      by: ['stallTypeId'],
      where: { stallTypeId: { in: typeIds }, ...holdingWhere(), ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) },
      _sum: { quantity: true },
    });
    return new Map(rows.map((r) => [r.stallTypeId, r._sum.quantity ?? 0]));
  }

  /** Locks the stall type and refuses if `adding` more stalls would oversell it. */
  private async checkCapacity(tx: Tx, stallTypeId: string, adding: number, excludeBookingId?: string) {
    await tx.$queryRaw`SELECT id FROM stall_types WHERE id = ${stallTypeId} FOR UPDATE`;
    const t = await tx.stallType.findUniqueOrThrow({ where: { id: stallTypeId } });
    const held = (await this.taken(tx, [stallTypeId], excludeBookingId)).get(stallTypeId) ?? 0;
    const left = t.totalCount - held;
    if (adding > left) {
      throw new ConflictException({
        statusCode: 409, code: 'STALLS_SOLD_OUT', available: Math.max(0, left),
        message: left <= 0 ? `All ${t.name} stalls are booked.` : `Only ${left} ${t.name} stall${left === 1 ? ' is' : 's are'} left.`,
      });
    }
    return t;
  }

  private async typesWithAvailability(eventId: string, onlyActive: boolean) {
    const types = await this.prisma.stallType.findMany({
      where: { eventId, ...(onlyActive ? { isActive: true } : {}) }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const taken = await this.taken(this.prisma, types.map((t) => t.id));
    return types.map((t) => presentType(t, taken.get(t.id) ?? 0));
  }

  // ─── Mandal ─────────────────────────────────────────────────────────

  async overview(organizationId: string, eventId: string) {
    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId }, select: { stallBookingEnabled: true, stallGstRateBps: true, gstEnabled: true, approvalStatus: true, status: true },
    });
    const [types, rates, payoutsReady, counts] = await Promise.all([
      this.typesWithAvailability(eventId, false),
      this.billing.rates(this.prisma, organizationId),
      this.payouts.isVerified(organizationId),
      this.prisma.stallBooking.aggregate({ where: { eventId, status: 'PAID' }, _count: { _all: true }, _sum: { quantity: true, amountPaise: true, platformFeePaise: true } }),
    ]);
    return {
      enabled: event.stallBookingEnabled,
      gstEnabled: event.gstEnabled,
      gstPercent: String(event.stallGstRateBps / 100),
      live: event.approvalStatus === 'LIVE' && event.status === 'ACTIVE',
      payoutsReady,
      onlinePayments: this.gateways.length > 0,
      platformFeePercent: (rates.stallCommissionBps / 100).toFixed(2),
      types,
      totals: {
        paidBookings: counts._count._all, stallsSold: counts._sum.quantity ?? 0,
        collected: rupees(counts._sum.amountPaise ?? 0), platformFees: rupees(counts._sum.platformFeePaise ?? 0),
      },
    };
  }

  async updateSettings(actorId: string, organizationId: string, eventId: string, dto: StallSettingsDto) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.event.findUniqueOrThrow({ where: { id: eventId }, select: { stallBookingEnabled: true, stallGstRateBps: true } });
      const after = await tx.event.update({
        where: { id: eventId },
        data: { stallBookingEnabled: dto.enabled, stallGstRateBps: dto.gstPercent === undefined ? undefined : Number(dto.gstPercent) * 100 },
        select: { stallBookingEnabled: true, stallGstRateBps: true },
      });
      await this.audit.log({ organizationId, eventId, actorId, action: 'stall.settings_updated', entityType: 'Event', entityId: eventId, before, after }, tx);
    });
    return this.overview(organizationId, eventId);
  }

  async createType(actorId: string, organizationId: string, eventId: string, dto: CreateStallTypeDto) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.stallType.create({
        data: {
          organizationId, eventId, name: dto.name.trim(), category: dto.category, description: dto.description?.trim() || null,
          size: dto.size?.trim() || null, pricePaise: toPaise(dto.price), totalCount: dto.totalCount, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0,
        },
      });
      await this.audit.log({ organizationId, eventId, actorId, action: 'stall_type.created', entityType: 'StallType', entityId: t.id, after: t }, tx);
    });
    return this.overview(organizationId, eventId);
  }

  private async findType(db: Db, eventId: string, id: string) {
    const t = await db.stallType.findFirst({ where: { id, eventId } }).catch(() => null);
    if (!t) throw new NotFoundException('Stall type not found');
    return t;
  }

  /**
   * Price changes apply to new bookings only (each booking keeps its own
   * price). The count can't drop below what is already booked or held.
   */
  async updateType(actorId: string, organizationId: string, eventId: string, id: string, dto: UpdateStallTypeDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.findType(tx, eventId, id);
      await tx.$queryRaw`SELECT id FROM stall_types WHERE id = ${id} FOR UPDATE`;
      const before = await tx.stallType.findUniqueOrThrow({ where: { id } });
      if (dto.totalCount !== undefined) {
        const held = (await this.taken(tx, [id])).get(id) ?? 0;
        if (dto.totalCount < held) {
          throw new ConflictException({ statusCode: 409, code: 'STALL_COUNT_TOO_LOW', message: `${held} ${before.name} stall${held === 1 ? ' is' : 's are'} already booked or being paid for — the count can't go below that.` });
        }
      }
      const after = await tx.stallType.update({
        where: { id },
        data: {
          name: dto.name?.trim(), category: dto.category,
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          size: dto.size === undefined ? undefined : dto.size?.trim() || null,
          pricePaise: dto.price === undefined ? undefined : toPaise(dto.price),
          totalCount: dto.totalCount, isActive: dto.isActive, sortOrder: dto.sortOrder,
        },
      });
      await this.audit.log({ organizationId, eventId, actorId, action: 'stall_type.updated', entityType: 'StallType', entityId: id, before, after }, tx);
    });
    return this.overview(organizationId, eventId);
  }

  /** Only a type nobody ever booked can be deleted; otherwise switch it off. */
  async deleteType(actorId: string, organizationId: string, eventId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const t = await this.findType(tx, eventId, id);
      if (await tx.stallBooking.count({ where: { stallTypeId: id } })) {
        throw new ConflictException({ statusCode: 409, code: 'STALL_TYPE_IN_USE', message: 'This stall type has bookings, so it can’t be deleted. Switch it off instead.' });
      }
      await tx.stallType.delete({ where: { id } });
      await this.audit.log({ organizationId, eventId, actorId, action: 'stall_type.deleted', entityType: 'StallType', entityId: id, before: t }, tx);
    });
    return this.overview(organizationId, eventId);
  }

  async bookings(eventId: string, q: StallBookingListQuery) {
    await this.expireStale({ eventId });
    const { page, pageSize, skip, take } = paging(q, 25);
    const t = searchTerm(q.q);
    const where: Prisma.StallBookingWhereInput = {
      eventId, status: q.status, stallTypeId: q.stallTypeId,
      ...(t ? { OR: [{ businessName: { contains: t, mode: 'insensitive' } }, { contactName: { contains: t, mode: 'insensitive' } }, { contactPhone: { contains: t } }, { invoiceNo: { contains: t, mode: 'insensitive' } }, { stallNumbers: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.stallBooking.findMany({ where, include: bookingInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.stallBooking.count({ where }),
    ]);
    return paged(rows.map((b) => this.presentForMandal(b)), total, page, pageSize);
  }

  async updateBooking(actorId: string, organizationId: string, eventId: string, id: string, dto: UpdateStallBookingDto) {
    const b = await this.prisma.stallBooking.findFirst({ where: { id, eventId } }).catch(() => null);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status !== 'PAID') throw new ConflictException({ statusCode: 409, code: 'BOOKING_NOT_PAID', message: 'Stall numbers can be assigned once the booking is paid.' });
    const after = await this.prisma.$transaction(async (tx) => {
      const a = await tx.stallBooking.update({
        where: { id },
        data: {
          stallNumbers: dto.stallNumbers === undefined ? undefined : dto.stallNumbers?.trim() || null,
          mandalNote: dto.mandalNote === undefined ? undefined : dto.mandalNote?.trim() || null,
        },
        include: bookingInclude,
      });
      await this.audit.log({
        organizationId, eventId, actorId, action: 'stall_booking.updated', entityType: 'StallBooking', entityId: id,
        before: { stallNumbers: b.stallNumbers, mandalNote: b.mandalNote }, after: { stallNumbers: a.stallNumbers, mandalNote: a.mandalNote },
      }, tx);
      return a;
    });
    return this.presentForMandal(after);
  }

  // ─── Public ─────────────────────────────────────────────────────────

  /** Festival page: is stall booking open, and what's left (no vendor details). */
  async publicSummary(eventId: string) {
    const ev = await this.prisma.event.findFirst({ where: { id: eventId, ...OPEN_EVENT }, select: { id: true, endDate: true, timezone: true } }).catch(() => null);
    if (!ev || ymd(ev.endDate) < todayIn(ev.timezone)) return { open: false, types: [] };
    const types = (await this.typesWithAvailability(eventId, true)).map(({ isActive: _a, sortOrder: _s, ...t }) => t);
    return { open: types.length > 0, types };
  }

  // ─── Vendor ─────────────────────────────────────────────────────────

  /** Festivals taking stall bookings now: live, not over, mandal ready to receive online payments. */
  async festivals(q: VendorFestivalQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const today = new Date(`${todayIn('Asia/Kolkata')}T00:00:00Z`);
    const where: Prisma.EventWhereInput = {
      ...OPEN_EVENT, endDate: { gte: today },
      stallTypes: { some: { isActive: true } },
      organization: { payoutAccount: { status: 'VERIFIED' } },
      ...(q.city ? { city: { equals: q.city.trim(), mode: 'insensitive' } } : {}),
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { city: { contains: t, mode: 'insensitive' } }, { organization: { name: { contains: t, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where, orderBy: [{ startDate: 'asc' }, { id: 'asc' }], skip, take,
        select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, ...VENUE_SELECT, organization: { select: { id: true, name: true } } },
      }),
      this.prisma.event.count({ where }),
    ]);
    const items = await Promise.all(rows.map(async (e) => {
      const types = await this.typesWithAvailability(e.id, true);
      const prices = types.map((x) => Number(x.price));
      return {
        id: e.id, name: e.name, festivalType: e.festivalType, startDate: ymd(e.startDate), endDate: ymd(e.endDate),
        venue: presentVenue(e), organization: e.organization,
        stallsAvailable: types.reduce((n, x) => n + x.available, 0), fromPrice: prices.length ? Math.min(...prices).toFixed(2) : null,
        categories: [...new Set(types.map((x) => x.category))],
      };
    }));
    return paged(items, total, page, pageSize);
  }

  async festival(eventId: string) {
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, ...OPEN_EVENT },
      select: {
        id: true, name: true, festivalType: true, description: true, startDate: true, endDate: true, timezone: true, gstEnabled: true, stallGstRateBps: true,
        organizationId: true, ...VENUE_SELECT, organization: { select: { id: true, name: true } },
      },
    }).catch(() => null);
    if (!e) throw new NotFoundException('This festival isn’t taking stall bookings.');
    const ready = await this.payouts.isVerified(e.organizationId);
    const closed = ymd(e.endDate) < todayIn(e.timezone);
    return {
      id: e.id, name: e.name, festivalType: e.festivalType, description: e.description, startDate: ymd(e.startDate), endDate: ymd(e.endDate),
      venue: presentVenue(e), organization: e.organization,
      bookable: ready && !closed && this.gateways.length > 0,
      gstPercent: e.gstEnabled ? String(e.stallGstRateBps / 100) : null,
      types: await this.typesWithAvailability(e.id, true),
    };
  }

  async createBooking(actor: RequestUser, vendor: VendorCtx, dto: CreateStallBookingDto) {
    const gateway = this.gateways[0];
    const type = await this.prisma.stallType.findUnique({
      where: { id: dto.stallTypeId },
      include: { event: { select: { id: true, name: true, organizationId: true, endDate: true, timezone: true, gstEnabled: true, stallGstRateBps: true, stallBookingEnabled: true, status: true, approvalStatus: true } } },
    }).catch(() => null);
    const ev = type?.event;
    if (!type || !ev || !type.isActive || !ev.stallBookingEnabled || ev.status !== 'ACTIVE' || ev.approvalStatus !== 'LIVE') {
      throw new NotFoundException('This stall type isn’t open for booking.');
    }
    if (ymd(ev.endDate) < todayIn(ev.timezone)) throw new ConflictException({ statusCode: 409, code: 'FESTIVAL_OVER', message: 'This festival is over.' });
    const rates = await this.billing.rates(this.prisma, ev.organizationId);
    const q = quoteStalls({ unitPricePaise: type.pricePaise, quantity: dto.quantity, gstOn: ev.gstEnabled, gstRateBps: ev.stallGstRateBps, commissionBps: rates.stallCommissionBps });
    const free = q.amountPaise === 0;
    if (!free) {
      if (!gateway) throw new ServiceUnavailableException({ statusCode: 503, code: 'NO_PAYMENTS', message: 'Online payment isn’t available right now.' });
      if (!(await this.payouts.isVerified(ev.organizationId))) {
        throw new ConflictException({ statusCode: 409, code: 'PAYOUTS_NOT_READY', message: 'This mandal can’t take online payments yet. Please try again later.' });
      }
    }

    const id = await this.prisma.$transaction(async (tx) => {
      // Serialise one vendor's bookings so the open-booking limit holds under concurrency.
      await tx.$queryRaw`SELECT id FROM vendors WHERE id = ${vendor.id} FOR UPDATE`;
      const open = await tx.stallBooking.count({ where: { vendorId: vendor.id, status: 'PENDING', expiresAt: { gt: new Date() } } });
      if (open >= MAX_OPEN_BOOKINGS_PER_VENDOR) {
        throw new ConflictException({ statusCode: 409, code: 'TOO_MANY_OPEN_BOOKINGS', message: `You have ${open} unpaid bookings. Pay or let them expire before booking more.` });
      }
      await this.checkCapacity(tx, type.id, dto.quantity);
      const b = await tx.stallBooking.create({
        data: {
          organizationId: ev.organizationId, eventId: ev.id, stallTypeId: type.id, vendorId: vendor.id, createdById: actor.id,
          quantity: dto.quantity, unitPricePaise: type.pricePaise, basePaise: q.basePaise, gstRateBps: q.gstRateBps, gstPaise: q.gstPaise,
          amountPaise: q.amountPaise, commissionBps: rates.stallCommissionBps, platformFeePaise: q.platformFeePaise,
          businessName: dto.businessName.trim(), contactName: dto.contactName.trim(), contactPhone: normalizeMobile(dto.contactPhone),
          contactEmail: dto.contactEmail ? normalizeEmail(dto.contactEmail) : null, products: dto.products?.trim() || null,
          paymentProvider: free ? 'free' : gateway!.key, expiresAt: new Date(Date.now() + STALL_HOLD_MINUTES * 60_000),
        },
      });
      await this.audit.log({
        organizationId: ev.organizationId, eventId: ev.id, actorId: actor.id, action: 'stall_booking.created', entityType: 'StallBooking', entityId: b.id,
        after: { vendorId: vendor.id, stallType: type.name, quantity: b.quantity, amount: rupees(b.amountPaise) },
      }, tx);
      if (free) await this.markPaid(tx, b, null, actor.id);
      return b.id;
    });

    if (!free) {
      const payment = await gateway!.createPayment({
        reference: id, amount: rupees(q.amountPaise), currency: 'INR', payerName: dto.businessName, description: `Stall — ${ev.name}`,
      });
      await this.prisma.stallBooking.update({ where: { id }, data: { providerOrderId: payment.providerOrderId } });
    }
    return this.myBooking(vendor, id);
  }

  async myBookings(vendor: VendorCtx, q: VendorBookingQuery) {
    await this.expireStale({ vendorId: vendor.id });
    const { page, pageSize, skip, take } = paging(q, 20);
    const where: Prisma.StallBookingWhereInput = { vendorId: vendor.id, status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.stallBooking.findMany({ where, include: bookingInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.stallBooking.count({ where }),
    ]);
    return paged(rows.map((b) => this.presentForVendor(b)), total, page, pageSize);
  }

  async myBooking(vendor: VendorCtx, id: string) {
    const b = await this.prisma.stallBooking.findFirst({ where: { id, vendorId: vendor.id }, include: bookingInclude }).catch(() => null);
    if (!b) throw new NotFoundException('Booking not found');
    if (b.status === 'PENDING' && b.expiresAt <= new Date()) {
      await this.closeBooking(b.id, 'EXPIRED');
      return this.presentForVendor(await this.prisma.stallBooking.findUniqueOrThrow({ where: { id }, include: bookingInclude }));
    }
    return this.presentForVendor(b);
  }

  /** Demo checkout result. Idempotent; serialized on the booking row (owned by this vendor). */
  async demoPay(actor: RequestUser, vendor: VendorCtx, id: string, outcome: 'success' | 'fail') {
    if (!demoPaymentsEnabled()) throw new NotFoundException();
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM stall_bookings WHERE id = ${id} AND "vendorId" = ${vendor.id} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Booking not found');
      const b = await tx.stallBooking.findUniqueOrThrow({ where: { id } });
      if (b.paymentProvider !== 'demo') throw new BadRequestException('This booking is not a demo payment.');
      if (b.status === 'PAID') return;
      if (b.status !== 'PENDING') throw new ConflictException({ statusCode: 409, code: 'BOOKING_CLOSED', message: 'This booking is no longer open for payment. Please book again.' });
      if (b.expiresAt <= new Date()) {
        // Marked EXPIRED below, outside this (rolled-back) transaction.
        throw new ConflictException({ statusCode: 409, code: 'BOOKING_EXPIRED', message: `The ${STALL_HOLD_MINUTES}-minute hold ran out. Please book again.` });
      }
      if (outcome === 'fail') {
        await tx.stallBooking.update({ where: { id }, data: { status: 'FAILED' } });
        return;
      }
      await this.markPaid(tx, b, `demo_pay_${randomBytes(6).toString('hex')}`, actor.id);
    }).catch((e) => {
      if (e instanceof ConflictException && (e.getResponse() as { code?: string }).code === 'BOOKING_EXPIRED') {
        return this.closeBooking(id, 'EXPIRED').then(() => { throw e; });
      }
      throw e;
    });
    return this.myBooking(vendor, id);
  }

  /** Paid: invoice number, platform fee split, audit. Capacity is re-checked (own hold excluded). */
  private async markPaid(tx: Tx, b: StallBooking, paymentReference: string | null, actorId: string) {
    await this.checkCapacity(tx, b.stallTypeId, b.quantity, b.id);
    let invoiceNo: string | null = null;
    if (b.amountPaise > 0) {
      const [row] = await tx.$queryRaw<{ stallInvoiceSeq: number; tokenPrefix: string; startDate: Date }[]>`
        UPDATE events SET "stallInvoiceSeq" = "stallInvoiceSeq" + 1 WHERE id = ${b.eventId} RETURNING "stallInvoiceSeq", "tokenPrefix", "startDate"`;
      invoiceNo = `${row.tokenPrefix}-STL-${row.startDate.getUTCFullYear()}-${String(row.stallInvoiceSeq).padStart(5, '0')}`;
    }
    await tx.stallBooking.update({ where: { id: b.id }, data: { status: 'PAID', paidAt: new Date(), paymentReference, invoiceNo } });
    if (b.amountPaise > 0) {
      await this.payouts.recordSettlement(tx, {
        organizationId: b.organizationId, eventId: b.eventId, sourceType: 'STALL_BOOKING', sourceId: b.id,
        grossPaise: b.amountPaise, commissionPaise: b.platformFeePaise, gstPaise: b.gstPaise,
      });
    }
    await this.audit.log({
      organizationId: b.organizationId, eventId: b.eventId, actorId, action: 'stall_booking.paid', entityType: 'StallBooking', entityId: b.id,
      after: { invoiceNo, amount: rupees(b.amountPaise), platformFee: rupees(b.platformFeePaise), quantity: b.quantity },
    }, tx);
  }

  // ─── Expiry ─────────────────────────────────────────────────────────

  /** PENDING → FAILED/EXPIRED exactly once (frees the stalls). */
  async closeBooking(id: string, status: 'FAILED' | 'EXPIRED') {
    await this.prisma.stallBooking.updateMany({ where: { id, status: 'PENDING' }, data: { status } });
  }

  /** Marks lapsed holds EXPIRED (they already stopped counting; this keeps lists honest). */
  private async expireStale(where: Prisma.StallBookingWhereInput = {}) {
    const r = await this.prisma.stallBooking.updateMany({ where: { ...where, status: 'PENDING', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } });
    return r.count;
  }

  private sweeper?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      this.sweeper = setInterval(() => void this.expireStale().catch(() => undefined), 60_000);
    }
  }
  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  // ─── Presenters ─────────────────────────────────────────────────────

  private presentCommon(b: BookingRow) {
    return {
      id: b.id, status: b.status, quantity: b.quantity,
      stallType: b.stallType,
      event: { id: b.event.id, name: b.event.name, startDate: ymd(b.event.startDate), endDate: ymd(b.event.endDate), venue: presentVenue(b.event), organization: b.event.organization },
      unitPrice: rupees(b.unitPricePaise), base: rupees(b.basePaise), gstPercent: String(b.gstRateBps / 100), gst: rupees(b.gstPaise), amount: rupees(b.amountPaise),
      businessName: b.businessName, contactName: b.contactName, contactPhone: b.contactPhone, contactEmail: b.contactEmail, products: b.products,
      invoiceNo: b.invoiceNo, stallNumbers: b.stallNumbers, paymentProvider: b.paymentProvider, paymentReference: b.paymentReference,
      expiresAt: b.expiresAt, paidAt: b.paidAt, createdAt: b.createdAt,
    };
  }

  private presentForVendor(b: BookingRow) {
    return { ...this.presentCommon(b), mandalNote: b.mandalNote };
  }

  private presentForMandal(b: BookingRow) {
    return { ...this.presentCommon(b), vendorId: b.vendorId, mandalNote: b.mandalNote, platformFee: rupees(b.platformFeePaise), commissionPercent: (b.commissionBps / 100).toFixed(2) };
  }
}
