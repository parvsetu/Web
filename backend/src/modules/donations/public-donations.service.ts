import {
  BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { LIVE_WHERE } from '../../common/event-approval';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { ORG_BRAND_SELECT, presentOrgBrand } from '../../common/org-brand';
import { ymd } from '../../common/time/validity';
import { PaymentProvider } from './payment-provider';
import { PASS_GATEWAYS, demoPaymentsEnabled } from '../passes/pass-gateways';
import { PayoutsService } from '../payouts/payouts.service';
import { TaxService } from '../tax/tax.service';
import { DonationsService, donorIdentity } from './donations.service';
import { CreatePublicDonationDto } from './donations.dto';

/** An unpaid online donation is closed (FAILED) after this long. */
export const DONATION_HOLD_MINUTES = 30;
export const PUBLIC_DONATION_MIN = 10;
export const PUBLIC_DONATION_MAX = 1_000_000;
const SUGGESTED_AMOUNTS = [101, 251, 501, 1100, 2100, 5100];

/** Donations open on the public site: the mandal switched it on, the festival is running and LIVE. */
const DONATABLE = { publicDonationsEnabled: true, status: 'ACTIVE' as const, ...LIVE_WHERE };

const eventSelect = {
  id: true, name: true, festivalType: true, organizationId: true,
  organization: { select: { name: true, ...ORG_BRAND_SELECT } },
} as const;

/**
 * Visitor-facing donations: no login. A donor gives against one festival, pays
 * online, and gets the same receipt (and 80G treatment) as a desk donation.
 * The donation's shareKey doubles as the donor's access key, so the receipt
 * link (/r/<id>?k=…) works as soon as the payment is confirmed.
 *
 * The money is collected by the platform's gateway and paid out to the mandal
 * (a PaymentSettlement, no platform commission on donations), so a verified
 * payout account is required. Until a real gateway is added to
 * buildPassGateways(), only the demo gateway exists (BOOKING_DEMO_PAYMENTS);
 * a real one confirms through confirmPaid() from its signed webhook.
 */
@Injectable()
export class PublicDonationsService {
  private readonly log = new Logger(PublicDonationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payouts: PayoutsService,
    private readonly tax: TaxService,
    private readonly donations: DonationsService,
    @Inject(PASS_GATEWAYS) private readonly gateways: PaymentProvider[],
  ) {}

  private async openEvent(eventId: string) {
    const e = await this.prisma.event.findFirst({ where: { id: eventId, ...DONATABLE }, select: { ...eventSelect, startDate: true, endDate: true } }).catch(() => null);
    if (!e) throw new NotFoundException({ statusCode: 404, code: 'DONATIONS_CLOSED', message: 'This festival is not taking online donations.' });
    return e;
  }

  /** What the donate page needs. `onlinePayments` false = the page explains donations aren't possible yet. */
  async eventInfo(eventId: string) {
    const e = await this.openEvent(eventId);
    const [verified, profile] = await Promise.all([
      this.payouts.isVerified(e.organizationId),
      this.prisma.orgTaxProfile.findUnique({ where: { organizationId: e.organizationId }, select: { status: true, validFrom: true, validTo: true, deductionPercent: true } }),
    ]);
    const today = ymd(new Date());
    const has80G = !!profile && profile.status === 'VERIFIED' && !!profile.deductionPercent
      && ymd(profile.validFrom) <= today && (!profile.validTo || ymd(profile.validTo) >= today);
    return {
      id: e.id, name: e.name, festivalType: e.festivalType, startDate: ymd(e.startDate), endDate: ymd(e.endDate),
      organization: presentOrgBrand(e.organization),
      onlinePayments: this.gateways.length > 0 && verified,
      /** The mandal's verified 80G deduction (50/100) — a hint only; each donation is still checked by the server. */
      deduction80G: has80G ? profile!.deductionPercent : null,
      minAmount: PUBLIC_DONATION_MIN.toFixed(2), maxAmount: PUBLIC_DONATION_MAX.toFixed(2), suggestedAmounts: SUGGESTED_AMOUNTS,
      holdMinutes: DONATION_HOLD_MINUTES,
    };
  }

  async create(dto: CreatePublicDonationDto) {
    const event = await this.openEvent(dto.eventId);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lt(PUBLIC_DONATION_MIN) || amount.gt(PUBLIC_DONATION_MAX)) {
      throw new BadRequestException({ statusCode: 400, code: 'AMOUNT_OUT_OF_RANGE', message: `Enter an amount between ₹${PUBLIC_DONATION_MIN} and ₹${PUBLIC_DONATION_MAX.toLocaleString('en-IN')}.` });
    }
    const gateway = this.gateways[0];
    if (!gateway) throw new ServiceUnavailableException({ statusCode: 503, code: 'PAYMENTS_UNAVAILABLE', message: 'Online payment isn’t available right now.' });
    if (!(await this.payouts.isVerified(event.organizationId))) {
      throw new ConflictException({ statusCode: 409, code: 'PAYOUTS_NOT_READY', message: 'This mandal can’t take online donations yet. Please try again later.' });
    }
    const donor = donorIdentity(dto);
    if (dto.taxId && donor.isAnonymous) {
      throw new BadRequestException({ statusCode: 400, code: 'ANONYMOUS_NO_TAX_ID', message: 'An anonymous donation carries no PAN / ID (and no 80G deduction).' });
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          eventId: event.id, ...donor,
          donorMobile: dto.donorMobile ? normalizeMobile(dto.donorMobile) : null, donorEmail: normalizeEmail(dto.donorEmail),
          amount, method: 'ONLINE', paymentProvider: gateway.key, paymentStatus: 'PENDING',
          shareKey: randomBytes(18).toString('base64url'), notes: 'Donated online on the festival page',
        },
      });
      if (dto.taxId) await this.tax.setDonorId(tx, d.id, dto.taxId, null);
      else await this.tax.sync(tx, d.id, null);
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, action: 'donation.created', entityType: 'Donation', entityId: d.id,
        after: { amount: amount.toFixed(2), method: 'ONLINE', provider: gateway.key, status: 'PENDING', source: 'PUBLIC', anonymous: d.isAnonymous },
      }, tx);
      return d.id;
    });

    const payment = await gateway.createPayment({
      reference: id, amount: amount.toFixed(2), currency: 'INR', payerName: donor.donorName ?? 'Anonymous donor', description: `Donation — ${event.name}`,
    });
    await this.prisma.donation.update({ where: { id }, data: { providerOrderId: payment.providerOrderId } });
    const row = await this.load(id);
    return { ...this.present(row), accessKey: row.shareKey! };
  }

  /** The donor's view. Unknown id and wrong key are indistinguishable (404). */
  async get(id: string, key: string) {
    let d = await this.load(id, key);
    if (d.paymentStatus === 'PENDING' && this.expired(d.createdAt)) {
      await this.closeExpired(d.id);
      d = await this.load(id, key);
    }
    return this.present(d);
  }

  async demoPay(id: string, key: string, outcome: 'success' | 'fail') {
    if (!demoPaymentsEnabled()) throw new NotFoundException('Not found');
    const d = await this.load(id, key);
    if (d.paymentProvider !== 'demo') throw new BadRequestException('This donation is not a demo payment.');
    if (outcome === 'fail') {
      await this.prisma.donation.updateMany({ where: { id, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
    } else {
      await this.confirmPaid(id, `demo_pay_${randomBytes(6).toString('hex')}`);
    }
    return this.get(id, key);
  }

  /**
   * Payment captured → receipt number, 80G re-check, payout settlement. Serialized
   * on the donation row and idempotent (a replayed confirmation changes nothing).
   */
  async confirmPaid(id: string, paymentReference: string) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM donations WHERE id = ${id} FOR UPDATE`;
      const d = await tx.donation.findUniqueOrThrow({ where: { id }, include: { event: { select: { organizationId: true } } } });
      if (d.paymentStatus === 'SUCCESS') return 'ALREADY' as const;
      if (d.paymentStatus !== 'PENDING') {
        throw new ConflictException({ statusCode: 409, code: 'DONATION_CLOSED', message: 'This donation is no longer open for payment. Please start again.' });
      }
      if (this.expired(d.createdAt)) {
        await tx.donation.update({ where: { id }, data: { paymentStatus: 'FAILED' } });
        return 'EXPIRED' as const;
      }
      await tx.donation.update({
        where: { id },
        data: { paymentStatus: 'SUCCESS', paymentReference, donatedAt: new Date(), receiptNo: await this.donations.nextReceipt(tx, d.eventId) },
      });
      await this.tax.sync(tx, id, null);
      await this.payouts.recordSettlement(tx, {
        organizationId: d.event.organizationId, eventId: d.eventId, sourceType: 'DONATION', sourceId: d.id,
        grossPaise: Math.round(Number(d.amount) * 100), commissionPaise: 0,
      });
      await this.audit.log({
        organizationId: d.event.organizationId, eventId: d.eventId, action: 'donation.paid', entityType: 'Donation', entityId: d.id,
        after: { amount: d.amount.toFixed(2), provider: d.paymentProvider, source: 'PUBLIC' },
      }, tx);
      return 'PAID' as const;
    });
    if (outcome === 'EXPIRED') {
      throw new ConflictException({ statusCode: 409, code: 'DONATION_EXPIRED', message: `The ${DONATION_HOLD_MINUTES}-minute payment window ran out. Please start again.` });
    }
    if (outcome === 'PAID') void this.sendReceipt(id);
  }

  /** Best effort: the donor already sees the receipt on screen. */
  private async sendReceipt(id: string) {
    try {
      const d = await this.prisma.donation.findUniqueOrThrow({ where: { id }, select: { donorEmail: true, event: { select: { id: true, name: true, organizationId: true } } } });
      if (d.donorEmail) await this.donations.emailReceipt(null, d.event, id);
    } catch (e) {
      this.log.warn(`Receipt email for donation ${id} failed: ${(e as Error).message}`);
    }
  }

  private expired(createdAt: Date) {
    return createdAt.getTime() + DONATION_HOLD_MINUTES * 60_000 <= Date.now();
  }

  /** Public checkouts are the only PENDING donations with a shareKey (desk ones get it once paid). */
  private async closeExpired(id?: string) {
    const r = await this.prisma.donation.updateMany({
      where: { id, paymentStatus: 'PENDING', shareKey: { not: null }, createdById: null, createdAt: { lte: new Date(Date.now() - DONATION_HOLD_MINUTES * 60_000) } },
      data: { paymentStatus: 'FAILED' },
    });
    return r.count;
  }

  private sweeper?: NodeJS.Timeout;
  onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.JEST_WORKER_ID) {
      this.sweeper = setInterval(() => void this.closeExpired().catch(() => undefined), 5 * 60_000);
    }
  }
  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private async load(id: string, key?: string) {
    const d = await this.prisma.donation.findUnique({
      where: { id },
      include: { event: { select: eventSelect } },
    }).catch(() => null);
    if (key !== undefined) {
      const a = Buffer.from(d?.shareKey ?? 'x'.repeat(24));
      const b = Buffer.from(key ?? '');
      if (!d?.shareKey || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Donation not found');
    }
    if (!d) throw new NotFoundException('Donation not found');
    return d;
  }

  private present(d: Awaited<ReturnType<PublicDonationsService['load']>>) {
    const paid = d.paymentStatus === 'SUCCESS' && !!d.receiptNo;
    return {
      id: d.id, status: d.paymentStatus, amount: d.amount.toFixed(2), currency: d.currency,
      donorName: d.donorName, isAnonymous: d.isAnonymous, receiptNo: d.receiptNo, createdAt: d.createdAt,
      expiresAt: new Date(d.createdAt.getTime() + DONATION_HOLD_MINUTES * 60_000),
      payment: { provider: d.paymentProvider, demo: d.paymentProvider === 'demo' },
      receiptPath: paid ? `/r/${d.id}?k=${d.shareKey}` : null,
      event: { id: d.event.id, name: d.event.name, festivalType: d.event.festivalType, organization: presentOrgBrand(d.event.organization) },
    };
  }
}
