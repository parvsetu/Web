import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { TokensService } from '../tokens/tokens.service';
import { QrSigner } from '../../common/qr/qr-signer';
import { PayoutsService } from '../payouts/payouts.service';
import { MailService } from '../../common/mail/mail.service';
import { randomBytes, timingSafeEqual } from 'crypto';

/** Public web origin for links in emails (first CORS origin, or PUBLIC_WEB_URL). */
function siteUrl() {
  return (process.env.PUBLIC_WEB_URL ?? (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0]).trim().replace(/\/+$/, '').replace('*', '');
}
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
    private readonly tokens: TokensService,
    private readonly qr: QrSigner,
    private readonly payouts: PayoutsService,
    private readonly mail: MailService,
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
    const d = await this.prisma.donation.findFirst({
      where: { id, eventId },
      select: { ...donationSelect, passes: { select: { id: true, tokenCode: true, secureToken: true, visitorCount: true, status: true, validFrom: true, validUntil: true }, orderBy: { tokenCode: 'asc' } } },
    });
    if (!d) throw new NotFoundException('Donation not found');
    const { passes, ...rest } = d;
    return {
      ...rest,
      passes: passes.map(({ secureToken, ...p }) => ({ ...p, qrPayload: this.qr.payloadFor(secureToken) })),
    };
  }

  async create(actor: RequestUser, event: EventRef, dto: CreateDonationDto, perms: Set<string> = new Set()) {
    const provider = this.provider(dto.provider ?? 'manual');
    if (dto.passes) return this.createWithPasses(actor, event, dto, perms, provider);
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
      reference: draft.id, amount: draft.amount.toFixed(2), currency: draft.currency, payerName: draft.donorName,
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

  /**
   * Cash/UPI-in-hand donation + entry passes for the donor, all in ONE
   * transaction: if the slot is full (or anything else fails) neither the
   * donation nor any pass is recorded. Needs TOKEN_CREATE as well.
   */
  private async createWithPasses(actor: RequestUser, event: EventRef, dto: CreateDonationDto, perms: Set<string>, provider: PaymentProvider) {
    if (!perms.has('TOKEN_CREATE')) {
      throw new ForbiddenException({ statusCode: 403, message: 'You need permission to issue tokens to give passes with a donation.', code: 'FORBIDDEN' });
    }
    if (provider.online) throw new BadRequestException('Passes can be issued with a donation only when the money is already received (manual).');
    const id = await this.prisma.$transaction(async (tx) => {
      const d = await tx.donation.create({
        data: {
          eventId: event.id, donorName: dto.donorName.trim(),
          donorMobile: dto.donorMobile ? normalizeMobile(dto.donorMobile) : null, donorEmail: normalizeEmail(dto.donorEmail),
          amount: new Prisma.Decimal(dto.amount), method: dto.method, paymentProvider: provider.key, paymentStatus: 'SUCCESS',
          paymentReference: dto.paymentReference ?? null, notes: dto.notes ?? null,
          donatedAt: dto.donatedAt ? new Date(dto.donatedAt) : new Date(), createdById: actor.id,
          receiptNo: await this.nextReceipt(tx, event.id),
        },
      });
      const passIds = await this.tokens.issueInTx(tx, actor, event, perms, {
        ...dto.passes!, visitorName: dto.passes!.visitorName ?? dto.donorName.trim(), visitorMobile: dto.passes!.visitorMobile ?? dto.donorMobile,
      }, d.id);
      await this.audit.log({
        organizationId: event.organizationId, eventId: event.id, actorId: actor.id, action: 'donation.created',
        entityType: 'Donation', entityId: d.id, after: { amount: d.amount.toFixed(2), method: d.method, provider: provider.key, status: 'SUCCESS', passes: passIds.length },
      }, tx);
      return d.id;
    });
    return this.get(event.id, id);
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

  /** Creates (once) the secret link the donor can open without logging in. */
  async share(eventId: string, id: string) {
    const d = await this.prisma.donation.findFirst({ where: { id, eventId }, select: { id: true, paymentStatus: true, shareKey: true } });
    if (!d) throw new NotFoundException('Donation not found');
    if (d.paymentStatus !== 'SUCCESS') throw new ConflictException({ message: 'A receipt can be shared once the payment is confirmed.', code: 'NOT_PAID' });
    const key = d.shareKey ?? randomBytes(18).toString('base64url');
    if (!d.shareKey) await this.prisma.donation.update({ where: { id }, data: { shareKey: key } });
    return { path: `/r/${id}?k=${key}`, url: `${siteUrl()}/r/${id}?k=${key}` };
  }

  async emailReceipt(actorId: string, event: EventRef, id: string) {
    const d = await this.prisma.donation.findFirst({ where: { id, eventId: event.id }, select: { donorEmail: true, donorName: true, amount: true, receiptNo: true } });
    if (!d) throw new NotFoundException('Donation not found');
    if (!d.donorEmail) throw new BadRequestException('This donation has no donor email.');
    const { url } = await this.share(event.id, id);
    const amount = `₹${Number(d.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    await this.mail.send({
      to: d.donorEmail,
      subject: `Your donation receipt ${d.receiptNo} — ${event.name}`,
      text: `Namaste ${d.donorName},\n\nThank you for your donation of ${amount} to ${event.name}.\nYour receipt ${d.receiptNo}: ${url}\n\n— ${event.name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #fed7aa;border-radius:16px;overflow:hidden"><div style="background:linear-gradient(135deg,#f59e0b,#f97316,#e11d48);color:#fff;padding:18px 22px;font-size:18px;font-weight:bold">🙏 Thank you, ${d.donorName.replace(/[<>&]/g, '')}</div><div style="padding:22px;color:#0f172a"><p>Your donation of <b>${amount}</b> to <b>${event.name.replace(/[<>&]/g, '')}</b> has been received.</p><p style="text-align:center;margin:24px 0"><a href="${url}" style="background:#ea580c;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">View / download receipt ${d.receiptNo}</a></p></div></div>`,
    });
    await this.audit.log({ organizationId: event.organizationId, eventId: event.id, actorId, action: 'donation.receipt_emailed', entityType: 'Donation', entityId: id });
    return { sent: true };
  }

  /** Public receipt view (secret key from the share link). */
  async publicReceipt(id: string, key: string) {
    const d = await this.prisma.donation.findUnique({ where: { id }, select: { shareKey: true, eventId: true } }).catch(() => null);
    const a = Buffer.from(d?.shareKey ?? 'x'.repeat(24));
    const b = Buffer.from(key ?? '');
    if (!d?.shareKey || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Receipt not found');
    return this.receipt(d.eventId, id);
  }

  async receipt(eventId: string, id: string) {
    const d = await this.prisma.donation.findFirst({
      where: { id, eventId },
      include: { event: { select: { name: true, festivalType: true, organizationId: true, organization: { select: { name: true, city: true, state: true, address: true } } } } },
    });
    if (!d) throw new NotFoundException('Donation not found');
    if (d.paymentStatus !== 'SUCCESS' || !d.receiptNo) {
      throw new ConflictException({ message: 'A receipt is only available once the payment is confirmed.', code: 'NOT_PAID' });
    }
    const identity = await this.payouts.receiptIdentity(d.event.organizationId);
    return {
      receiptNo: d.receiptNo, organization: d.event.organization, event: { name: d.event.name, festivalType: d.event.festivalType },
      issuer: identity,
      donorMobile: d.donorMobile, donorEmail: d.donorEmail,
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
