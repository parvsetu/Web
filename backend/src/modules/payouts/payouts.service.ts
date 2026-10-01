import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PayoutAccount, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { canonicalState } from '../../common/india-locations';
import { decryptField, encryptField, last4 } from '../../common/crypto/field-crypto';
import { paged, paging } from '../../common/http';
import { rupees } from '../billing/billing.service';
import { PayoutAccountDto, ReviewPayoutDto } from './payouts.dto';

const MAX_PROOF = 2 * 1024 * 1024;

function parseProof(dataUrl: string) {
  const m = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new BadRequestException('Proof must be a PNG/JPEG photo or a PDF');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_PROOF) throw new BadRequestException('Proof must be 2 MB or smaller');
  const ok =
    (m[1] === 'image/png' && bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) ||
    (m[1] === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (m[1] === 'application/pdf' && bytes.subarray(0, 4).toString('ascii') === '%PDF');
  if (!ok) throw new BadRequestException('The proof file is not a valid image or PDF');
  return { bytes, type: m[1] };
}

/** API view — never the full account number or PANs. */
export function presentPayout(a: PayoutAccount) {
  return {
    entityType: a.entityType, registeredType: a.registeredType, legalName: a.legalName, registrationNumber: a.registrationNumber,
    orgPan: a.orgPanLast4 ? `XXXXXX${a.orgPanLast4}` : null, gstin: a.gstin, reg80G: a.reg80G, reg12A: a.reg12A,
    addressLine: a.addressLine, city: a.city, state: a.state, pincode: a.pincode,
    contactName: a.contactName, contactRole: a.contactRole, contactPhone: a.contactPhone, contactEmail: a.contactEmail,
    signatoryPan: `XXXXXX${a.signatoryPanLast4}`,
    bankHolderName: a.bankHolderName, bankAccount: `XXXXXX${a.bankAccountLast4}`, ifsc: a.ifsc, accountType: a.accountType,
    hasProof: !!a.proof, status: a.status, reviewNote: a.reviewNote, reviewedAt: a.reviewedAt, gatewayAccountId: a.gatewayAccountId,
    submittedAt: a.submittedAt, updatedAt: a.updatedAt,
  };
}

/**
 * Mandal payout accounts (registered & unregistered) and the split-payment
 * settlement ledger. A gateway with split settlement (e.g. Razorpay Route)
 * would create the linked account at VERIFIED and move each settlement's
 * net to the mandal automatically; until then payouts are recorded here
 * with the bank transfer reference (UTR).
 */
@Injectable()
export class PayoutsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async get(organizationId: string) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId } });
    return a ? presentPayout(a) : null;
  }

  async isVerified(organizationId: string) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId }, select: { status: true } });
    return a?.status === 'VERIFIED';
  }

  /** Submitting (or changing) the account always goes back to review; payouts pause until verified. */
  async submit(actorId: string, organizationId: string, dto: PayoutAccountDto) {
    const state = canonicalState(dto.state);
    if (!state) throw new BadRequestException(`Unknown state "${dto.state}"`);
    if (dto.entityType === 'REGISTERED' && !dto.orgPan) throw new BadRequestException('Organisation PAN is required for a registered mandal');
    const proof = dto.proofDataUrl ? parseProof(dto.proofDataUrl) : null;
    const before = await this.prisma.payoutAccount.findUnique({ where: { organizationId } });
    const reg = dto.entityType === 'REGISTERED';
    const data = {
      entityType: dto.entityType, registeredType: reg ? dto.registeredType! : null, legalName: dto.legalName.trim(),
      registrationNumber: reg ? dto.registrationNumber!.trim() : null,
      orgPanEnc: reg && dto.orgPan ? encryptField(dto.orgPan) : null, orgPanLast4: reg && dto.orgPan ? last4(dto.orgPan) : null,
      gstin: dto.gstin || null, reg80G: reg ? dto.reg80G?.trim() || null : null, reg12A: reg ? dto.reg12A?.trim() || null : null,
      addressLine: dto.addressLine.trim(), city: dto.city.trim(), state, pincode: dto.pincode,
      contactName: dto.contactName.trim(), contactRole: dto.contactRole.trim(), contactPhone: dto.contactPhone, contactEmail: dto.contactEmail.toLowerCase(),
      signatoryPanEnc: encryptField(dto.signatoryPan), signatoryPanLast4: last4(dto.signatoryPan),
      bankHolderName: dto.bankHolderName.trim(), bankAccountEnc: encryptField(dto.bankAccount), bankAccountLast4: last4(dto.bankAccount),
      ifsc: dto.ifsc, accountType: dto.accountType,
      ...(proof ? { proof: proof.bytes, proofType: proof.type } : {}),
      status: 'PENDING' as const, reviewNote: null, reviewedById: null, reviewedAt: null, gatewayAccountId: null,
      consentAt: new Date(), submittedById: actorId, submittedAt: new Date(),
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const a = await tx.payoutAccount.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
      await this.audit.log({
        organizationId, actorId, action: before ? 'payout_account.updated' : 'payout_account.submitted', entityType: 'PayoutAccount', entityId: organizationId,
        before: before ? presentPayout(before) : undefined, after: presentPayout(a),
      }, tx);
      return a;
    });
    return presentPayout(saved);
  }

  // ─── Super admin review ────────────────────────────────────────────

  async list(q: { status?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.PayoutAccountWhereInput = { status: q.status as PayoutAccount['status'] | undefined };
    const [rows, total] = await Promise.all([
      this.prisma.payoutAccount.findMany({ where, orderBy: { submittedAt: 'desc' }, skip, take, include: { organization: { select: { name: true, city: true, state: true } } } }),
      this.prisma.payoutAccount.count({ where }),
    ]);
    return paged(rows.map((r) => ({ organizationId: r.organizationId, organization: r.organization, ...presentPayout(r) })), total, page, pageSize);
  }

  async review(actorId: string, organizationId: string, dto: ReviewPayoutDto) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId } });
    if (!a) throw new NotFoundException('No payout account submitted');
    if (dto.decision !== 'VERIFIED' && !dto.note?.trim()) throw new BadRequestException('Tell the mandal what to fix (note)');
    const after = await this.prisma.$transaction(async (tx) => {
      const r = await tx.payoutAccount.update({
        where: { organizationId },
        data: { status: dto.decision, reviewNote: dto.note?.trim() || null, reviewedById: actorId, reviewedAt: new Date(), gatewayAccountId: dto.gatewayAccountId ?? a.gatewayAccountId },
      });
      await this.audit.log({ organizationId, actorId, action: `payout_account.${dto.decision.toLowerCase()}`, entityType: 'PayoutAccount', entityId: organizationId, before: { status: a.status }, after: { status: r.status }, reason: dto.note }, tx);
      return r;
    });
    return presentPayout(after);
  }

  async proof(organizationId: string) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId }, select: { proof: true, proofType: true } });
    if (!a?.proof || !a.proofType) throw new NotFoundException('No proof uploaded');
    return { bytes: Buffer.from(a.proof), type: a.proofType };
  }

  /** Full bank details for the super admin making a manual transfer (audited). */
  async revealBank(actorId: string, organizationId: string) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId } });
    if (!a) throw new NotFoundException('No payout account');
    if (a.status !== 'VERIFIED') throw new ConflictException({ message: 'Bank details are released only for a verified account.', code: 'NOT_VERIFIED' });
    await this.audit.log({ organizationId, actorId, action: 'payout_account.bank_revealed', entityType: 'PayoutAccount', entityId: organizationId });
    return { bankHolderName: a.bankHolderName, bankAccount: decryptField(a.bankAccountEnc), ifsc: a.ifsc, accountType: a.accountType };
  }

  /** Organisation PAN for 80G receipts (registered mandals only). */
  async receiptIdentity(organizationId: string) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { organizationId } });
    if (!a || a.status !== 'VERIFIED') return null;
    return {
      legalName: a.legalName, entityType: a.entityType, registrationNumber: a.registrationNumber,
      pan: a.orgPanEnc ? decryptField(a.orgPanEnc) : null, reg80G: a.reg80G, reg12A: a.reg12A, gstin: a.gstin,
      address: `${a.addressLine}, ${a.city}, ${a.state} ${a.pincode}`,
    };
  }

  // ─── Settlement ledger ──────────────────────────────────────────────

  /**
   * Called inside the payment-confirmation transaction. Splits the gross
   * into gateway fee, platform commission and the mandal's net (never
   * negative), once per source (sourceId @unique).
   */
  async recordSettlement(tx: Prisma.TransactionClient, s: { organizationId: string; eventId: string; sourceType: string; sourceId: string; grossPaise: number; commissionPaise: number; gstPaise?: number }) {
    const settings = await tx.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
    const gatewayFee = Math.min(s.grossPaise, Math.round((s.grossPaise * settings.gatewayFeeBps) / 10000));
    const commission = Math.min(s.commissionPaise, s.grossPaise - gatewayFee);
    return tx.paymentSettlement.create({
      data: {
        organizationId: s.organizationId, eventId: s.eventId, sourceType: s.sourceType, sourceId: s.sourceId,
        grossPaise: s.grossPaise, gatewayFeePaise: gatewayFee, commissionPaise: commission, netPaise: s.grossPaise - gatewayFee - commission,
        gstPaise: s.gstPaise ?? 0,
      },
    });
  }

  async settlements(q: { organizationId?: string; status?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.PaymentSettlementWhereInput = { organizationId: q.organizationId, status: q.status as Prisma.PaymentSettlementWhereInput['status'] };
    const [rows, total, sums] = await Promise.all([
      this.prisma.paymentSettlement.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { organization: { select: { name: true } } } }),
      this.prisma.paymentSettlement.count({ where }),
      this.prisma.paymentSettlement.groupBy({ by: ['status'], where: { organizationId: q.organizationId }, _sum: { grossPaise: true, netPaise: true, commissionPaise: true, gatewayFeePaise: true } }),
    ]);
    const eventIds = [...new Set(rows.map((r) => r.eventId).filter(Boolean))] as string[];
    const events = eventIds.length ? await this.prisma.event.findMany({ where: { id: { in: eventIds } }, select: { id: true, name: true } }) : [];
    const sum = (st: string, k: 'grossPaise' | 'netPaise' | 'commissionPaise' | 'gatewayFeePaise') => sums.find((x) => x.status === st)?._sum[k] ?? 0;
    const all = (k: 'grossPaise' | 'netPaise' | 'commissionPaise' | 'gatewayFeePaise') => sum('PENDING_PAYOUT', k) + sum('PAID_OUT', k);
    return {
      ...paged(rows.map((r) => ({
        id: r.id, createdAt: r.createdAt, organization: { id: r.organizationId, name: r.organization.name },
        event: r.eventId ? events.find((e) => e.id === r.eventId) ?? null : null, sourceType: r.sourceType, sourceId: r.sourceId,
        gross: rupees(r.grossPaise), gatewayFee: rupees(r.gatewayFeePaise), commission: rupees(r.commissionPaise), net: rupees(r.netPaise), gst: rupees(r.gstPaise),
        status: r.status, payoutId: r.payoutId,
      })), total, page, pageSize),
      totals: {
        gross: rupees(all('grossPaise')), commission: rupees(all('commissionPaise')), gatewayFees: rupees(all('gatewayFeePaise')),
        netToMandals: rupees(all('netPaise')), pendingPayout: rupees(sum('PENDING_PAYOUT', 'netPaise')), paidOut: rupees(sum('PAID_OUT', 'netPaise')),
      },
    };
  }

  /** Pays out everything pending for a mandal in one transfer (records the bank UTR). */
  async recordPayout(actorId: string, organizationId: string, reference: string, note?: string) {
    if (!(await this.isVerified(organizationId))) throw new ConflictException({ message: 'Verify the mandal’s payout account first.', code: 'NOT_VERIFIED' });
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.$queryRaw<{ id: string; netPaise: number }[]>`
        SELECT id, "netPaise" FROM payment_settlements WHERE "organizationId" = ${organizationId} AND status = 'PENDING_PAYOUT' FOR UPDATE`;
      const amount = pending.reduce((s, r) => s + r.netPaise, 0);
      if (amount <= 0) throw new BadRequestException('Nothing is pending payout for this mandal.');
      const p = await tx.payout.create({ data: { organizationId, amountPaise: amount, reference: reference.trim(), note: note?.trim() || null, createdById: actorId } });
      await tx.paymentSettlement.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { status: 'PAID_OUT', payoutId: p.id } });
      await this.audit.log({ organizationId, actorId, action: 'payout.recorded', entityType: 'Payout', entityId: p.id, after: { amount: rupees(amount), reference, settlements: pending.length } }, tx);
      return { id: p.id, amount: rupees(amount), reference: p.reference, settlements: pending.length, paidAt: p.paidAt };
    });
  }

  async payouts(q: { organizationId?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q);
    const where = { organizationId: q.organizationId };
    const [rows, total] = await Promise.all([
      this.prisma.payout.findMany({ where, orderBy: { paidAt: 'desc' }, skip, take, include: { organization: { select: { name: true } }, _count: { select: { settlements: true } } } }),
      this.prisma.payout.count({ where }),
    ]);
    return paged(rows.map((p) => ({ id: p.id, organization: { id: p.organizationId, name: p.organization.name }, amount: rupees(p.amountPaise), reference: p.reference, note: p.note, paidAt: p.paidAt, settlements: p._count.settlements })), total, page, pageSize);
  }
}
