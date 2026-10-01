import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EventRef } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { amountInWords } from '../../common/money';
import { paged, paging, userRef } from '../../common/http';
import { dayRange } from '../../common/time/validity';
import { PAYMENT_PROVIDERS, PaymentProvider } from './payment-provider';
import { CreateDonationDto, DonationListQuery, UpdateDonationDto } from './donations.dto';

const donationSelect = {
  id: true, receiptNo: true, donorName: true, donorMobile: true, donorEmail: true, amount: true, currency: true,
  method: true, paymentStatus: true, paymentProvider: true, paymentReference: true, providerOrderId: true,
  donatedAt: true, notes: true, createdAt: true, createdBy: userRef,
} as const;

@Injectable()
export class DonationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(PAYMENT_PROVIDERS) private readonly providers: PaymentProvider[],
  ) {}

  listProviders() {
    return this.providers.map((p) => ({ key: p.key, label: p.label, online: p.online }));
  }

  private provider(key: string) {
    const p = this.providers.find((x) => x.key === key);
    if (!p) throw new BadRequestException(`Unknown payment provider "${key}"`);
    return p;
  }

  /** Receipt numbers come from an atomic per-event counter, assigned only when money is confirmed. */
  private async nextReceipt(tx: Prisma.TransactionClient, eventId: string) {
    const rows = await tx.$queryRaw<{ donationReceiptSeq: number; tokenPrefix: string; startDate: Date }[]>`
      UPDATE events SET "donationReceiptSeq" = "donationReceiptSeq" + 1 WHERE id = ${eventId}
      RETURNING "donationReceiptSeq", "tokenPrefix", "startDate"`;
    const r = rows[0];
    return `${r.tokenPrefix}-R-${r.startDate.getUTCFullYear()}-${String(r.donationReceiptSeq).padStart(5, '0')}`;
  }

  async list(event: EventRef, q: DonationListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.DonationWhereInput = {
      eventId: event.id, paymentStatus: q.status, method: q.method,
      donatedAt: q.from || q.to ? dayRange(q.from ?? q.to!, q.to ?? q.from!, event.timezone) : undefined,
      ...(q.q ? { OR: [{ donorName: { contains: q.q, mode: 'insensitive' } }, { donorMobile: { contains: q.q } }, { receiptNo: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, sum] = await Promise.all([
      this.prisma.donation.findMany({ where, select: donationSelect, orderBy: { donatedAt: 'desc' }, skip, take }),
      this.prisma.donation.count({ where }),
      this.prisma.donation.aggregate({ where: { ...where, paymentStatus: 'SUCCESS' }, _sum: { amount: true } }),
    ]);
    return { ...paged(items, total, page, pageSize), totalReceived: (sum._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
  }

  async get(eventId: string, id: string) {
    const d = await this.prisma.donation.findFirst({ where: { id, eventId }, select: donationSelect });
    if (!d) throw new NotFoundException('Donation not found');
    return d;
  }

  async create(actor: RequestUser, event: EventRef, dto: CreateDonationDto) {
    const provider = this.provider(dto.provider ?? 'manual');
    if (provider.online && dto.method !== 'ONLINE' && dto.method !== 'UPI' && dto.method !== 'CARD') {
      throw new BadRequestException('Online providers take UPI, CARD or ONLINE payments');
    }
    const draft = await this.prisma.donation.create({
      data: {
        eventId: event.id, donorName: dto.donorName.trim(),
        donorMobile: dto.donorMobile ? normalizeMobile(dto.donorMobile) : null,
        donorEmail: normalizeEmail(dto.donorEmail),
        amount: new Prisma.Decimal(dto.amount), method: dto.method, paymentProvider: provider.key,
        paymentReference: dto.paymentReference ?? null, notes: dto.notes ?? null,
        donatedAt: dto.donatedAt ? new Date(dto.donatedAt) : new Date(), createdById: actor.id,
      },
    });
    const payment = await provider.createPayment({
      donationId: draft.id, amount: draft.amount.toFixed(2), currency: draft.currency, donorName: draft.donorName,
      description: `Donation — ${event.name}`,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.donation.update({
        where: { id: draft.id },
        data: {
          paymentStatus: payment.status,
          providerOrderId: payment.providerOrderId,
          receiptNo: payment.status === 'SUCCESS' ? await this.nextReceipt(tx, event.id) : null,
        },
      });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'donation.created',
        entityType: 'Donation', entityId: draft.id, after: { amount: draft.amount.toFixed(2), method: draft.method, provider: provider.key, status: payment.status },
      }, tx);
    });
    const donation = await this.get(event.id, draft.id);
    return provider.online
      ? { ...donation, payment: { provider: provider.key, providerOrderId: payment.providerOrderId, checkoutUrl: payment.checkoutUrl, upiUri: payment.upiUri } }
      : donation;
  }

  async update(actor: RequestUser, event: EventRef, id: string, dto: UpdateDonationDto) {
    const before = await this.get(event.id, id);
    await this.prisma.$transaction(async (tx) => {
      const becomesPaid = dto.paymentStatus === 'SUCCESS' && before.paymentStatus !== 'SUCCESS';
      await tx.donation.update({
        where: { id },
        data: {
          paymentStatus: dto.paymentStatus, paymentReference: dto.paymentReference, notes: dto.notes,
          receiptNo: becomesPaid && !before.receiptNo ? await this.nextReceipt(tx, event.id) : undefined,
        },
      });
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'donation.updated',
        entityType: 'Donation', entityId: id,
        before: { paymentStatus: before.paymentStatus, paymentReference: before.paymentReference, notes: before.notes },
        after: { paymentStatus: dto.paymentStatus ?? before.paymentStatus, paymentReference: dto.paymentReference ?? before.paymentReference, notes: dto.notes ?? before.notes },
        reason: dto.reason,
      }, tx);
    });
    return this.get(event.id, id);
  }

  async receipt(eventId: string, id: string) {
    const d = await this.prisma.donation.findFirst({
      where: { id, eventId },
      include: { event: { select: { name: true, organization: { select: { name: true, city: true, address: true } } } } },
    });
    if (!d) throw new NotFoundException('Donation not found');
    if (d.paymentStatus !== 'SUCCESS' || !d.receiptNo) {
      throw new ConflictException({ message: 'A receipt is only available once the payment is confirmed.', code: 'NOT_PAID' });
    }
    return {
      receiptNo: d.receiptNo, organization: d.event.organization, event: { name: d.event.name },
      donorName: d.donorName, amount: d.amount.toFixed(2), amountInWords: amountInWords(d.amount.toFixed(2)),
      currency: d.currency, method: d.method, paymentReference: d.paymentReference, donatedAt: d.donatedAt,
    };
  }

  /** Provider-signed status callback. Only PENDING donations move. */
  async webhook(providerKey: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer | undefined) {
    const provider = this.provider(providerKey);
    if (!provider.parseWebhook || !rawBody) throw new NotFoundException('Not found');
    const evt = await provider.parseWebhook(headers, rawBody);
    const d = await this.prisma.donation.findUnique({
      where: { paymentProvider_providerOrderId: { paymentProvider: provider.key, providerOrderId: evt.providerOrderId } },
      include: { event: { select: { organizationId: true } } },
    });
    if (!d) throw new NotFoundException('Unknown order');
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.donation.updateMany({
        where: { id: d.id, paymentStatus: d.paymentStatus === 'SUCCESS' && evt.status === 'REFUNDED' ? 'SUCCESS' : 'PENDING' },
        data: {
          paymentStatus: evt.status,
          paymentReference: evt.paymentReference ?? undefined,
          receiptNo: evt.status === 'SUCCESS' && !d.receiptNo ? await this.nextReceipt(tx, d.eventId) : undefined,
        },
      });
      if (moved.count === 1) {
        await this.audit.log({
          organizationId: d.event.organizationId, eventId: d.eventId, action: 'donation.payment_webhook',
          entityType: 'Donation', entityId: d.id, before: { paymentStatus: d.paymentStatus }, after: { paymentStatus: evt.status, provider: provider.key },
        }, tx);
      }
    });
    return { received: true };
  }
}
