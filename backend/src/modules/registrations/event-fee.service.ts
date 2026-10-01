import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventFeePayment, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { FestivalCatalogService } from '../../common/catalog/festival-catalog.service';
import { resolveEventFee } from '../../common/event-approval';
import { brandedEmail, MailService } from '../../common/mail/mail.service';
import { siteUrl } from '../../common/site-url';
import { ymd } from '../../common/time/validity';
import { BillingService, rupees } from '../billing/billing.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { maskEmail } from '../auth/otp.service';
import { AgentEarningsService } from './agent-earnings.service';

type Db = Prisma.TransactionClient | PrismaService;

/** How long a pay link stays open before the super admin has to issue a fresh one. */
export const FEE_LINK_DAYS = 14;

export function payUrl(token: string) {
  return `${siteUrl()}/pay/event-fee/${token}`;
}

export function presentFeePayment(p: EventFeePayment) {
  const open = p.status === 'PENDING' && p.expiresAt > new Date();
  return {
    id: p.id, amount: rupees(p.amountPaise), status: p.status === 'PENDING' && !open ? 'EXPIRED' : p.status, method: p.method,
    paymentReference: p.paymentReference, note: p.note, expiresAt: p.expiresAt, paidAt: p.paidAt, createdAt: p.createdAt,
    refundedAt: p.refundedAt, refundReason: p.refundReason,
    /** Shareable pay link — only while it can still be paid. */
    payUrl: open ? payUrl(p.token) : null,
  };
}

/**
 * Per-event registration fee. Each event pays separately; the fee is quoted
 * at submission (mandal override > festival type > catalog group > default)
 * and locked at approval. Payment goes through an opaque, expiring pay link
 * (EventFeePayment.token) on the demo gateway, or the super admin marks it
 * paid (cash / bank) or waives it. Settling a fee makes the event LIVE.
 *
 * Lock order everywhere: payment row → event row → organization row (the last
 * one inside AgentEarningsService), so concurrent payments can't deadlock.
 */
@Injectable()
export class EventFeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
    private readonly catalog: FestivalCatalogService,
    private readonly mail: MailService,
    private readonly earnings: AgentEarningsService,
  ) {}

  /** The fee for one event of `festivalType` at this mandal (null org = a not-yet-approved registration). */
  async quote(db: Db, organizationId: string | null, festivalType: string) {
    const [s, b, entry] = await Promise.all([
      this.billing.settings(db),
      organizationId ? db.orgBilling.findUnique({ where: { organizationId }, select: { eventFeePaise: true } }) : null,
      this.catalog.find(festivalType, db),
    ]);
    const rates = await db.eventFeeRate.findMany({
      where: { OR: [{ scope: 'TYPE', key: festivalType }, ...(entry ? [{ scope: 'GROUP', key: entry.group }] : [])] },
    });
    return resolveEventFee({
      mandalPaise: b?.eventFeePaise,
      typePaise: rates.find((r) => r.scope === 'TYPE')?.feePaise,
      groupPaise: rates.find((r) => r.scope === 'GROUP')?.feePaise,
      defaultPaise: s.defaultEventFeePaise,
    });
  }

  /** Opens a fresh pay link for an approved event (any older open link is cancelled). */
  async openLink(tx: Prisma.TransactionClient, event: { id: string; organizationId: string }, amountPaise: number, actorId: string | null) {
    await tx.eventFeePayment.updateMany({ where: { eventId: event.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    return tx.eventFeePayment.create({
      data: {
        eventId: event.id, organizationId: event.organizationId, amountPaise, token: randomBytes(24).toString('base64url'),
        expiresAt: new Date(Date.now() + FEE_LINK_DAYS * 86_400_000), createdById: actorId,
      },
    });
  }

  /** Latest payment rows of an event (mandal + super admin views). */
  async history(eventId: string) {
    const rows = await this.prisma.eventFeePayment.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' }, take: 10 });
    return rows.map(presentFeePayment);
  }

  // ─── Public pay link ─────────────────────────────────────────────────

  async publicView(token: string) {
    const p = await this.prisma.eventFeePayment.findUnique({
      where: { token },
      include: { event: { select: { name: true, festivalType: true, startDate: true, endDate: true, location: true, city: true, approvalStatus: true } }, organization: { select: { name: true, city: true } } },
    });
    if (!p) throw new NotFoundException('This payment link is not valid.');
    if (p.status === 'PENDING' && p.expiresAt <= new Date()) {
      await this.prisma.eventFeePayment.updateMany({ where: { id: p.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
      p.status = 'EXPIRED';
    }
    return {
      amount: rupees(p.amountPaise), status: p.status, expiresAt: p.expiresAt, paidAt: p.paidAt,
      event: { name: p.event.name, festivalType: p.event.festivalType, startDate: ymd(p.event.startDate), endDate: ymd(p.event.endDate), location: p.event.location, city: p.event.city, live: p.event.approvalStatus === 'LIVE' },
      organization: p.organization,
      demoPayments: demoPaymentsEnabled(),
    };
  }

  /** Demo checkout. Idempotent per success: a paid link answers PAID again and never charges twice. */
  async demoPay(token: string, outcome: 'success' | 'fail') {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM event_fee_payments WHERE token = ${token} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('This payment link is not valid.');
      const p = await tx.eventFeePayment.findUniqueOrThrow({ where: { id: rows[0].id } });
      if (p.status === 'PAID') return;
      if (p.status !== 'PENDING') throw new ConflictException({ statusCode: 409, code: 'FEE_LINK_CLOSED', message: `This payment link is ${p.status.toLowerCase()}. Ask the Parvsetu team for a new one.` });
      if (p.expiresAt <= new Date()) {
        await tx.eventFeePayment.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
        throw new ConflictException({ statusCode: 409, code: 'FEE_LINK_EXPIRED', message: 'This payment link has expired. Ask the Parvsetu team for a new one.' });
      }
      if (outcome === 'fail') return; // a failed attempt leaves the link open to retry
      await this.settle(tx, p, { method: 'ONLINE', provider: 'demo', reference: `demo_pay_${randomBytes(6).toString('hex')}`, actorId: null });
    });
    return this.publicView(token);
  }

  /**
   * PENDING → PAID/WAIVED and event APPROVED_AWAITING_PAYMENT → LIVE (published:
   * a draft becomes ACTIVE). Caller holds the payment row lock.
   */
  private async settle(
    tx: Prisma.TransactionClient, p: EventFeePayment,
    o: { method: 'ONLINE' | 'CASH' | 'BANK_TRANSFER' | 'WAIVER'; provider?: string; reference?: string | null; note?: string | null; actorId: string | null },
  ) {
    await tx.$queryRaw`SELECT id FROM events WHERE id = ${p.eventId} FOR UPDATE`;
    const ev = await tx.event.findUniqueOrThrow({ where: { id: p.eventId } });
    if (ev.approvalStatus !== 'APPROVED_AWAITING_PAYMENT') {
      throw new ConflictException({ statusCode: 409, code: 'EVENT_NOT_AWAITING_PAYMENT', message: 'This festival is not waiting for its registration fee.' });
    }
    const waived = o.method === 'WAIVER';
    const now = new Date();
    await tx.eventFeePayment.update({
      where: { id: p.id },
      data: {
        status: waived ? 'WAIVED' : 'PAID', method: o.method, paymentProvider: o.provider ?? null, paymentReference: o.reference ?? null,
        note: o.note ?? null, paidAt: now, recordedById: o.actorId,
      },
    });
    await tx.event.update({
      where: { id: ev.id },
      data: { approvalStatus: 'LIVE', liveAt: now, status: ev.status === 'DRAFT' ? 'ACTIVE' : undefined },
    });
    await this.audit.log({
      organizationId: ev.organizationId, eventId: ev.id, actorId: o.actorId, action: waived ? 'event_fee.waived' : 'event_fee.paid',
      entityType: 'EventFeePayment', entityId: p.id,
      before: { approvalStatus: ev.approvalStatus, status: ev.status },
      after: { approvalStatus: 'LIVE', amount: rupees(p.amountPaise), method: o.method, reference: o.reference ?? null },
      reason: o.note ?? null,
    }, tx);
    if (!waived && p.amountPaise > 0) await this.earnings.onFeePaid(tx, { organizationId: ev.organizationId, eventId: ev.id, paymentId: p.id, amountPaise: p.amountPaise });
  }

  /** Locks (or opens) the event's open pay link so the super admin can settle it by hand. */
  private async lockOpenPayment(tx: Prisma.TransactionClient, eventId: string, actorId: string) {
    const ev = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, approvalStatus: true, feePaise: true } });
    if (!ev) throw new NotFoundException('Event not found');
    if (ev.approvalStatus !== 'APPROVED_AWAITING_PAYMENT') {
      throw new ConflictException({ statusCode: 409, code: 'EVENT_NOT_AWAITING_PAYMENT', message: 'This festival is not waiting for its registration fee.' });
    }
    let rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM event_fee_payments WHERE "eventId" = ${eventId} AND status = 'PENDING' FOR UPDATE`;
    if (!rows.length) {
      await this.openLink(tx, ev, ev.feePaise ?? 0, actorId);
      rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM event_fee_payments WHERE "eventId" = ${eventId} AND status = 'PENDING' FOR UPDATE`;
    }
    return tx.eventFeePayment.findUniqueOrThrow({ where: { id: rows[0].id } });
  }

  // ─── Super admin ─────────────────────────────────────────────────────

  async markPaid(actorId: string, eventId: string, dto: { method: 'CASH' | 'BANK_TRANSFER'; reference: string; note?: string }) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockOpenPayment(tx, eventId, actorId);
      await this.settle(tx, p, { method: dto.method, reference: dto.reference.trim(), note: dto.note?.trim() || null, actorId });
    });
    return this.history(eventId);
  }

  async waive(actorId: string, eventId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const p = await this.lockOpenPayment(tx, eventId, actorId);
      await this.settle(tx, p, { method: 'WAIVER', note: reason.trim(), actorId });
    });
    return this.history(eventId);
  }

  /** Fresh pay link (the old one stops working). */
  async regenerate(actorId: string, eventId: string) {
    const p = await this.prisma.$transaction(async (tx) => {
      const ev = await tx.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true, approvalStatus: true, feePaise: true } });
      if (!ev) throw new NotFoundException('Event not found');
      if (ev.approvalStatus !== 'APPROVED_AWAITING_PAYMENT') throw new ConflictException({ statusCode: 409, code: 'EVENT_NOT_AWAITING_PAYMENT', message: 'This festival is not waiting for its registration fee.' });
      const created = await this.openLink(tx, ev, ev.feePaise ?? 0, actorId);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId, action: 'event_fee.link_created', entityType: 'EventFeePayment', entityId: created.id, after: { amount: rupees(created.amountPaise), expiresAt: created.expiresAt } }, tx);
      return created;
    });
    return presentFeePayment(p);
  }

  /** Emails the open pay link to the mandal's contact (registration contact, else its admins). */
  async emailLink(actorId: string, eventId: string) {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, include: { organization: { select: { id: true, name: true, registration: { select: { contactEmail: true, contactName: true } } } } } });
    if (!ev) throw new NotFoundException('Event not found');
    const p = await this.prisma.eventFeePayment.findFirst({ where: { eventId, status: 'PENDING', expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!p) throw new ConflictException({ statusCode: 409, code: 'NO_OPEN_LINK', message: 'There is no open payment link. Create a new one first.' });
    const recipients = await this.contacts(ev.organization.id, ev.organization.registration);
    if (!recipients.length) throw new BadRequestException({ message: 'This mandal has no contact email.', code: 'NO_CONTACT_EMAIL' });
    for (const r of recipients) await this.mail.send({ to: r.email, ...feeLinkEmail(r.name, ev.organization.name, ev.name, rupees(p.amountPaise), payUrl(p.token), p.expiresAt) });
    await this.audit.log({ organizationId: ev.organizationId, eventId, actorId, action: 'event_fee.link_emailed', entityType: 'EventFeePayment', entityId: p.id, after: { to: recipients.map((r) => maskEmail(r.email)) } });
    return { sentTo: recipients.map((r) => maskEmail(r.email)) };
  }

  async contacts(organizationId: string, registration?: { contactEmail: string; contactName: string } | null) {
    if (registration?.contactEmail) return [{ email: registration.contactEmail, name: registration.contactName }];
    const admins = await this.prisma.organizationMember.findMany({
      where: { organizationId, status: 'ACTIVE', role: { key: 'MANDAL_ADMIN' }, user: { email: { not: null } } },
      select: { user: { select: { email: true, name: true } } }, take: 3,
    });
    return admins.map((a) => ({ email: a.user.email!, name: a.user.name }));
  }

  /**
   * Refund of a paid fee (audited). With no passes issued the event goes back to
   * APPROVED_AWAITING_PAYMENT (unpublished, a new pay link opens); once passes
   * exist the event stays LIVE and the refund is only recorded. Agent earnings
   * from this payment are reversed either way.
   */
  async refund(actorId: string, eventId: string, reason: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM event_fee_payments WHERE "eventId" = ${eventId} AND status = 'PAID' FOR UPDATE`;
      if (!rows.length) throw new ConflictException({ statusCode: 409, code: 'NOTHING_TO_REFUND', message: 'This festival has no paid registration fee to refund.' });
      const p = await tx.eventFeePayment.findUniqueOrThrow({ where: { id: rows[0].id } });
      await tx.$queryRaw`SELECT id FROM events WHERE id = ${eventId} FOR UPDATE`;
      const ev = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
      const passes = await tx.token.count({ where: { eventId } });
      await tx.eventFeePayment.update({ where: { id: p.id }, data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: reason.trim(), refundedById: actorId } });
      const unpublish = passes === 0 && ev.approvalStatus === 'LIVE';
      if (unpublish) {
        await tx.event.update({ where: { id: eventId }, data: { approvalStatus: 'APPROVED_AWAITING_PAYMENT', liveAt: null, status: ev.status === 'ACTIVE' ? 'DRAFT' : undefined } });
        await this.openLink(tx, ev, ev.feePaise ?? p.amountPaise, actorId);
      }
      await this.earnings.onFeeRefunded(tx, { organizationId: ev.organizationId, paymentId: p.id, actorId });
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId, action: 'event_fee.refunded', entityType: 'EventFeePayment', entityId: p.id,
        before: { status: 'PAID', approvalStatus: ev.approvalStatus }, after: { status: 'REFUNDED', amount: rupees(p.amountPaise), approvalStatus: unpublish ? 'APPROVED_AWAITING_PAYMENT' : ev.approvalStatus, passesIssued: passes },
        reason: reason.trim(),
      }, tx);
      return { unpublished: unpublish, passesIssued: passes };
    });
    return { ...result, payments: await this.history(eventId) };
  }
}

export function feeLinkEmail(name: string, orgName: string, eventName: string, amount: string, url: string, expiresAt: Date) {
  return brandedEmail({
    subject: `Pay ₹${amount} to publish ${eventName} on Parvsetu`,
    title: 'Your festival is approved 🎉',
    name,
    paragraphs: [
      `${eventName} (${orgName}) has been approved by the Parvsetu team.`,
      `Pay the event registration fee of ₹${amount} and it goes live straight away — listed on Parvsetu, open for bookings, passes and gate scanning.`,
    ],
    cta: { label: `Pay ₹${amount}`, url },
    footer: `This link works until ${expiresAt.toISOString().slice(0, 10)}. Each festival is paid separately.`,
  });
}
