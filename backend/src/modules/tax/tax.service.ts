import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgTaxProfile, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { decryptField, encryptField, last4 } from '../../common/crypto/field-crypto';
import { dateOnly, ymd } from '../../common/time/validity';
import { paged, paging, toCsv } from '../../common/http';
import { rupees } from '../billing/billing.service';
import {
  DONOR_ID_TYPES, DonorIdType, INELIGIBLE_LABEL, IneligibleReason, PAN_RE, anonymousDonationCheck, donorIdHash, evaluate80G, financialYearOf,
  financialYearRange, isValidFy, maskId, normalizeDonorId, receiptMode,
} from './tax-rules';
import { DonorIdDto, File10BDDto, Issue10BEDto, ReviewTaxProfileDto, TaxProfileDto } from './tax.dto';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const toPaise = (d: Prisma.Decimal) => Math.round(Number(d) * 100);
/** Stable JSON for comparing document snapshots (key order independent). */
const stable = (v: unknown): string => (v && typeof v === 'object' && !Array.isArray(v)
  ? `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
  : JSON.stringify(v));

/**
 * 80G donation tax. Eligibility is decided here and only here (evaluate80G),
 * stored on DonationTaxRecord and re-evaluated inside every transaction that
 * changes something it depends on (payment status, anonymity, donor ID, the
 * mandal's 80G profile). The issued receipt is a versioned DonationDocument:
 * a change to what it says supersedes it with a new version; a refund cancels
 * it. Nothing here is a tax computation — it records and reports; the
 * mandal's CA files Form 10BD and downloads Form 10BE from the portal.
 */
@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async settings(db: Db) {
    return db.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  }

  // ─── Per-donation record ───────────────────────────────────────────

  /** Encrypts and stores (or clears, with null) the donor's ID; then re-evaluates. Anonymous donations take no ID. */
  async setDonorId(tx: Tx, donationId: string, dto: DonorIdDto | null, actorId: string | null) {
    const d = await tx.donation.findUniqueOrThrow({ where: { id: donationId }, select: { isAnonymous: true, eventId: true, event: { select: { organizationId: true } } } });
    if (dto && d.isAnonymous) throw new BadRequestException({ statusCode: 400, code: 'ANONYMOUS_NO_TAX_ID', message: 'An anonymous donation carries no donor PAN / ID (and no 80G deduction).' });
    let data: { idType: string | null; idNumberEnc: string | null; idLast4: string | null; donorIdHash: string | null; donorAddress: string | null };
    if (dto) {
      const type = dto.idType as DonorIdType;
      const n = normalizeDonorId(type, dto.idNumber);
      if (!n) throw new BadRequestException({ statusCode: 400, code: 'BAD_DONOR_ID', message: type === 'PAN' ? 'PAN must look like ABCDE1234F.' : `That ${DONOR_ID_TYPES[type].label} number doesn't look right.` });
      data = { idType: type, idNumberEnc: encryptField(n), idLast4: last4(n), donorIdHash: donorIdHash(type, n), donorAddress: dto.address?.replace(/\s+/g, ' ').trim() || null };
    } else {
      data = { idType: null, idNumberEnc: null, idLast4: null, donorIdHash: null, donorAddress: null };
    }
    const before = await tx.donationTaxRecord.findUnique({ where: { donationId }, select: { idType: true, idLast4: true } });
    // Changing the ID resets eligibility in the same write (the CHECK forbids "eligible without an ID");
    // sync() right below decides it again.
    const reset = { eligible: false, ineligibleReason: 'DONOR_ID_MISSING', deductionPercent: null };
    if (before) await tx.donationTaxRecord.update({ where: { donationId }, data: { ...data, ...reset } });
    else await tx.donationTaxRecord.create({ data: { donationId, organizationId: d.event.organizationId, eventId: d.eventId, financialYear: financialYearOf(new Date()), ...data, ...reset } });
    // Masked values only — never the number itself.
    await this.audit.log({
      organizationId: d.event.organizationId, eventId: d.eventId, actorId, action: dto ? 'donation.tax_id_set' : 'donation.tax_id_cleared',
      entityType: 'Donation', entityId: donationId, before: before ? { id: maskId(before.idType, before.idLast4) } : null, after: { id: maskId(data.idType, data.idLast4) },
    }, tx);
    return this.sync(tx, donationId, actorId);
  }

  /**
   * Re-evaluates one donation and keeps its receipt document in step.
   * Call inside the transaction that changed the donation.
   */
  async sync(tx: Tx, donationId: string, actorId: string | null = null) {
    const d = await tx.donation.findUniqueOrThrow({
      where: { id: donationId },
      select: {
        id: true, eventId: true, receiptNo: true, donorName: true, isAnonymous: true, amount: true, method: true, paymentStatus: true, donatedAt: true,
        event: { select: { organizationId: true } }, taxRecord: true,
      },
    });
    const orgId = d.event.organizationId;
    const [profile, settings] = await Promise.all([tx.orgTaxProfile.findUnique({ where: { organizationId: orgId } }), this.settings(tx)]);
    const r = d.taxRecord;
    const res = evaluate80G({
      paymentStatus: d.paymentStatus, isAnonymous: d.isAnonymous, method: d.method, amountPaise: toPaise(d.amount), donatedAt: d.donatedAt,
      hasDonorId: !!r?.donorIdHash, profile, cashLimitPaise: settings.tax80GCashLimitPaise,
    });
    const fields = {
      financialYear: financialYearOf(d.donatedAt),
      eligible: res.eligible, ineligibleReason: res.eligible ? null : res.reason, deductionPercent: res.eligible ? res.deductionPercent : null,
    };
    const changed = !r || r.eligible !== fields.eligible || r.ineligibleReason !== fields.ineligibleReason || r.deductionPercent !== fields.deductionPercent || r.financialYear !== fields.financialYear;
    // Not upsert: Prisma runs it as INSERT … ON CONFLICT, and Postgres checks the CHECK constraint on the
    // INSERT candidate too — an "eligible" candidate without the existing row's donor ID would fail.
    const record = r
      ? await tx.donationTaxRecord.update({ where: { donationId }, data: fields })
      : await tx.donationTaxRecord.create({ data: { donationId, organizationId: orgId, eventId: d.eventId, ...fields } });
    await this.syncReceipt(tx, d, record, profile, actorId);
    if (changed && r) await this.flagFiledYear(tx, orgId, record.financialYear, donationId);
    return record;
  }

  private receiptSnapshot(d: { receiptNo: string | null; donorName: string | null; isAnonymous: boolean; amount: Prisma.Decimal; method: string; donatedAt: Date }, r: { eligible: boolean; deductionPercent: number | null; idType: string | null; idLast4: string | null; donorAddress: string | null; financialYear: string }, profile: OrgTaxProfile | null) {
    return {
      receiptNo: d.receiptNo, donor: d.isAnonymous ? null : d.donorName, anonymous: d.isAnonymous, donorId: maskId(r.idType, r.idLast4), donorAddress: r.donorAddress,
      amount: d.amount.toFixed(2), method: d.method, donatedAt: d.donatedAt.toISOString(), financialYear: r.financialYear,
      eligibleFor80G: r.eligible, deductionPercent: r.deductionPercent,
      urn: r.eligible && profile ? profile.urn : null, urnIssuedOn: r.eligible && profile ? ymd(profile.urnIssuedOn) : null,
    };
  }

  /** ISSUED receipt version follows what the receipt says; a refund (not paid) cancels it. Never deleted. */
  private async syncReceipt(tx: Tx, d: Parameters<TaxService['receiptSnapshot']>[0] & { id: string; paymentStatus: string; event: { organizationId: string } }, r: Parameters<TaxService['receiptSnapshot']>[1], profile: OrgTaxProfile | null, actorId: string | null) {
    const current = await tx.donationDocument.findFirst({ where: { donationId: d.id, kind: 'RECEIPT', status: 'ISSUED' } });
    if (d.paymentStatus !== 'SUCCESS' || !d.receiptNo) {
      if (current) {
        await tx.donationDocument.update({ where: { id: current.id }, data: { status: 'CANCELLED', closedAt: new Date(), closeReason: `Payment ${d.paymentStatus.toLowerCase()}` } });
        await this.audit.log({ organizationId: d.event.organizationId, actorId, action: 'donation.receipt_cancelled', entityType: 'DonationDocument', entityId: current.id, after: { receiptNo: current.docNo, version: current.version } }, tx);
      }
      return;
    }
    const snap = this.receiptSnapshot(d, r, profile);
    if (current && stable(current.snapshot) === stable(snap)) return;
    const last = await tx.donationDocument.findFirst({ where: { donationId: d.id, kind: 'RECEIPT' }, orderBy: { version: 'desc' }, select: { version: true } });
    if (current) await tx.donationDocument.update({ where: { id: current.id }, data: { status: 'SUPERSEDED', closedAt: new Date(), closeReason: 'Receipt details changed' } });
    const doc = await tx.donationDocument.create({
      data: { organizationId: d.event.organizationId, kind: 'RECEIPT', donationId: d.id, financialYear: r.financialYear, docNo: d.receiptNo, version: (last?.version ?? 0) + 1, snapshot: snap, issuedById: actorId },
    });
    await this.audit.log({ organizationId: d.event.organizationId, actorId, action: current ? 'donation.receipt_reissued' : 'donation.receipt_issued', entityType: 'DonationDocument', entityId: doc.id, after: { receiptNo: d.receiptNo, version: doc.version, eligibleFor80G: snap.eligibleFor80G } }, tx);
  }

  /** A change to a donation inside a filed Form 10BD marks that filing for revision. */
  private async flagFiledYear(tx: Tx, orgId: string, fy: string, donationId: string) {
    await tx.form10BDFiling.updateMany({
      where: { organizationId: orgId, financialYear: fy, status: 'FILED', donationIds: { has: donationId } },
      data: { status: 'REVISION_NEEDED', revisionNote: 'A donation in this filing changed after it was filed — file a correction.' },
    });
  }

  /** Re-evaluates every donation of the mandal (after its 80G profile changed). */
  async syncOrg(orgId: string, actorId: string | null) {
    const ids = (await this.prisma.donation.findMany({ where: { event: { organizationId: orgId } }, select: { id: true } })).map((d) => d.id);
    for (let i = 0; i < ids.length; i += 50) {
      await this.prisma.$transaction(async (tx) => {
        for (const id of ids.slice(i, i + 50)) await this.sync(tx, id, actorId);
      });
    }
    return ids.length;
  }

  /** What a donation's tax state looks like to staff (masked ID only with DONATION_TAX_VIEW). */
  present(r: { eligible: boolean; ineligibleReason: string | null; deductionPercent: number | null; idType: string | null; idLast4: string | null; donorAddress: string | null; financialYear: string } | null, canViewTax: boolean) {
    if (!r) return null;
    return {
      eligibleFor80G: r.eligible, deductionPercent: r.deductionPercent, financialYear: r.financialYear,
      ineligibleReason: r.ineligibleReason, ineligibleLabel: r.ineligibleReason ? INELIGIBLE_LABEL[r.ineligibleReason as IneligibleReason] ?? r.ineligibleReason : null,
      ...(canViewTax ? { donorId: maskId(r.idType, r.idLast4), idType: r.idType, hasDonorId: !!r.idType, donorAddress: r.donorAddress } : {}),
    };
  }

  async documents(donationId: string) {
    const rows = await this.prisma.donationDocument.findMany({ where: { donationId }, orderBy: [{ kind: 'asc' }, { version: 'desc' }] });
    return rows.map((x) => ({ id: x.id, kind: x.kind, docNo: x.docNo, version: x.version, status: x.status, issuedAt: x.issuedAt, closedAt: x.closedAt, closeReason: x.closeReason, snapshot: x.snapshot }));
  }

  // ─── Mandal 80G profile ─────────────────────────────────────────────

  presentProfile(p: OrgTaxProfile | null) {
    if (!p) return null;
    const today = new Date().toISOString().slice(0, 10);
    return {
      urn: p.urn, urnIssuedOn: ymd(p.urnIssuedOn), validFrom: ymd(p.validFrom), validTo: p.validTo ? ymd(p.validTo) : null,
      pan: `••••••${p.orgPanLast4}`, sectionCode: p.sectionCode, deductionPercent: p.deductionPercent, status: p.status,
      expired: !!p.validTo && ymd(p.validTo) < today, reviewNote: p.reviewNote, reviewedAt: p.reviewedAt, submittedAt: p.submittedAt, updatedAt: p.updatedAt,
    };
  }

  async getProfile(orgId: string) {
    return this.presentProfile(await this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } }));
  }

  /** Mandal submits / corrects its 80G details → SUBMITTED (a verified profile goes back to review on any change). */
  async saveProfile(actorId: string, orgId: string, dto: TaxProfileDto) {
    const pan = dto.pan.replace(/\s+/g, '').toUpperCase();
    if (!PAN_RE.test(pan)) throw new BadRequestException({ statusCode: 400, code: 'BAD_PAN', message: 'The mandal’s PAN must look like AAATS1234F.' });
    if (dto.validTo && dto.validTo < dto.validFrom) throw new BadRequestException({ statusCode: 400, code: 'BAD_VALIDITY', message: '“Valid to” must be after “valid from”.' });
    const before = await this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } });
    const data = {
      urn: dto.urn.replace(/\s+/g, '').toUpperCase(), urnIssuedOn: dateOnly(dto.urnIssuedOn), validFrom: dateOnly(dto.validFrom), validTo: dto.validTo ? dateOnly(dto.validTo) : null,
      orgPanEnc: encryptField(pan), orgPanLast4: last4(pan), sectionCode: dto.sectionCode?.trim() || 'Section 80G',
      status: 'SUBMITTED' as const, deductionPercent: null, reviewNote: null, reviewedAt: null, reviewedById: null, submittedById: actorId, submittedAt: new Date(),
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.orgTaxProfile.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, ...data }, update: data });
      await this.audit.log({ organizationId: orgId, actorId, action: 'tax_profile.submitted', entityType: 'OrgTaxProfile', entityId: orgId, before: before ? this.presentProfile(before) : null, after: { urn: data.urn, validFrom: dto.validFrom, validTo: dto.validTo ?? null, pan: `••••••${data.orgPanLast4}` } }, tx);
    });
    // A previously verified profile no longer backs any deduction until re-verified.
    if (before?.status === 'VERIFIED') await this.syncOrg(orgId, actorId);
    return this.getProfile(orgId);
  }

  async listProfiles(q: { status?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const where: Prisma.OrgTaxProfileWhereInput = { status: q.status as Prisma.OrgTaxProfileWhereInput['status'] };
    const [rows, total] = await Promise.all([
      this.prisma.orgTaxProfile.findMany({ where, orderBy: [{ submittedAt: 'desc' }], skip, take, include: { organization: { select: { id: true, name: true, city: true, state: true } } } }),
      this.prisma.orgTaxProfile.count({ where }),
    ]);
    return paged(rows.map((p) => ({ organization: p.organization, ...this.presentProfile(p)! })), total, page, pageSize);
  }

  /** Super admin: VERIFY (with the deduction %) or REJECT; every donation of the mandal is re-evaluated. */
  async reviewProfile(actorId: string, orgId: string, dto: ReviewTaxProfileDto) {
    const p = await this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } });
    if (!p) throw new NotFoundException('This mandal has no 80G details.');
    if (p.status !== 'SUBMITTED' && !(p.status === 'VERIFIED' && dto.decision === 'REJECT')) {
      throw new ConflictException({ statusCode: 409, code: 'TAX_PROFILE_STATE', message: `A ${p.status.toLowerCase()} 80G profile can't be ${dto.decision === 'VERIFY' ? 'verified' : 'rejected'}.` });
    }
    if (dto.decision === 'VERIFY' && !dto.deductionPercent) throw new BadRequestException({ statusCode: 400, code: 'DEDUCTION_REQUIRED', message: 'Choose the deduction (50% or 100%) on the 80G approval.' });
    if (dto.decision === 'REJECT' && !dto.note?.trim()) throw new BadRequestException({ statusCode: 400, code: 'NOTE_REQUIRED', message: 'Tell the mandal why.' });
    await this.prisma.$transaction(async (tx) => {
      await tx.orgTaxProfile.update({
        where: { organizationId: orgId },
        data: { status: dto.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED', deductionPercent: dto.decision === 'VERIFY' ? dto.deductionPercent : null, reviewNote: dto.note?.trim() || null, reviewedAt: new Date(), reviewedById: actorId },
      });
      await this.audit.log({ organizationId: orgId, actorId, action: dto.decision === 'VERIFY' ? 'tax_profile.verified' : 'tax_profile.rejected', entityType: 'OrgTaxProfile', entityId: orgId, before: { status: p.status }, after: { status: dto.decision === 'VERIFY' ? 'VERIFIED' : 'REJECTED', deductionPercent: dto.deductionPercent ?? null }, reason: dto.note }, tx);
    });
    const donations = await this.syncOrg(orgId, actorId);
    return { profile: await this.getProfile(orgId), donationsReevaluated: donations };
  }

  // ─── Form 10BD / 10BE (per mandal, per financial year) ──────────────

  private assertFy(fy: string) {
    if (!isValidFy(fy)) throw new BadRequestException({ statusCode: 400, code: 'BAD_FY', message: 'Financial year looks like 2026-27.' });
  }

  /** Eligible donations of the year grouped per donor (+ mode, as the portal wants), plus the ineligible breakdown. */
  private async yearRows(orgId: string, fy: string, decrypt: boolean) {
    const rows = await this.prisma.donationTaxRecord.findMany({
      where: { organizationId: orgId, financialYear: fy, donation: { paymentStatus: 'SUCCESS' } },
      include: { donation: { select: { id: true, donorName: true, amount: true, method: true, donatedAt: true, receiptNo: true, isAnonymous: true } } },
    });
    const eligible = rows.filter((r) => r.eligible);
    type DonorRow = { donorIdHash: string; idType: string; idLast4: string; idNumber: string | null; name: string; address: string | null; byMode: Map<string, number>; totalPaise: number; donationIds: string[]; receipts: string[] };
    const donors = new Map<string, DonorRow>();
    for (const r of eligible) {
      const k = r.donorIdHash!;
      const g: DonorRow = donors.get(k) ?? { donorIdHash: k, idType: r.idType!, idLast4: r.idLast4!, idNumber: decrypt ? decryptField(r.idNumberEnc!) : null, name: r.donation.donorName ?? '', address: r.donorAddress, byMode: new Map<string, number>(), totalPaise: 0, donationIds: [], receipts: [] };
      const p = toPaise(r.donation.amount);
      const mode = receiptMode(r.donation.method);
      g.byMode.set(mode, (g.byMode.get(mode) ?? 0) + p);
      g.totalPaise += p;
      g.donationIds.push(r.donation.id);
      if (r.donation.receiptNo) g.receipts.push(r.donation.receiptNo);
      if (!g.address && r.donorAddress) g.address = r.donorAddress;
      donors.set(k, g);
    }
    const byReason = new Map<string, { count: number; paise: number }>();
    let totalPaise = 0, anonymousPaise = 0;
    for (const r of rows) {
      const p = toPaise(r.donation.amount);
      totalPaise += p;
      if (r.donation.isAnonymous) anonymousPaise += p;
      if (!r.eligible) {
        const b = byReason.get(r.ineligibleReason ?? 'UNKNOWN') ?? { count: 0, paise: 0 };
        b.count++; b.paise += p;
        byReason.set(r.ineligibleReason ?? 'UNKNOWN', b);
      }
    }
    return { donors: [...donors.values()].sort((a, b) => a.name.localeCompare(b.name)), eligibleCount: eligible.length, totalPaise, anonymousPaise, byReason };
  }

  async year(orgId: string, fy: string) {
    this.assertFy(fy);
    const settings = await this.settings(this.prisma);
    const range = financialYearRange(fy, settings.tax10BDDueMonthDay);
    const [profile, data, filings, certs] = await Promise.all([
      this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } }),
      this.yearRows(orgId, fy, false),
      this.prisma.form10BDFiling.findMany({ where: { organizationId: orgId, financialYear: fy }, orderBy: { createdAt: 'desc' } }),
      this.prisma.donationDocument.findMany({ where: { organizationId: orgId, kind: 'FORM_10BE', financialYear: fy }, orderBy: { version: 'desc' } }),
    ]);
    const current = filings.find((f) => f.status !== 'SUPERSEDED') ?? null;
    const eligiblePaise = data.donors.reduce((n, d) => n + d.totalPaise, 0);
    const bbc = anonymousDonationCheck(data.totalPaise, data.anonymousPaise);
    return {
      financialYear: fy, dueDate: range.dueDate, profile: this.presentProfile(profile),
      totals: { donations: rupees(data.totalPaise), eligible: rupees(eligiblePaise), eligibleDonations: data.eligibleCount, donors: data.donors.length },
      ineligible: [...data.byReason.entries()].map(([reason, v]) => ({ reason, label: INELIGIBLE_LABEL[reason as IneligibleReason] ?? reason, count: v.count, amount: rupees(v.paise) })),
      /** s.115BBC information for the CA — not applied anywhere. */
      anonymous: { total: rupees(data.anonymousPaise), threshold: rupees(bbc.thresholdPaise), above: rupees(bbc.abovePaise) },
      filing: current ? { id: current.id, status: current.status, ackNumber: current.ackNumber, filedOn: ymd(current.filedOn), donors: current.donorCount, donations: current.donationCount, total: rupees(current.totalPaise), revisionNote: current.revisionNote } : null,
      filings: filings.map((f) => ({ id: f.id, status: f.status, ackNumber: f.ackNumber, filedOn: ymd(f.filedOn), total: rupees(f.totalPaise), createdAt: f.createdAt })),
      donors: data.donors.map((d) => {
        const issued = certs.find((c) => c.donorIdHash === d.donorIdHash && c.status === 'ISSUED');
        const inFiling = !!current && d.donationIds.every((id) => current.donationIds.includes(id));
        return {
          donorKey: d.donorIdHash, name: d.name, donorId: maskId(d.idType, d.idLast4), address: d.address, total: rupees(d.totalPaise), donations: d.donationIds.length, receipts: d.receipts,
          form10BE: issued ? { status: 'ISSUED', certificateNo: issued.docNo, version: issued.version, issuedAt: issued.issuedAt } : { status: current?.status === 'FILED' && inFiling ? 'READY' : 'AWAITING_10BD' },
        };
      }),
    };
  }

  /** The portal's Form 10BD columns, one row per donor and mode of receipt, with the full donor ID (sensitive export — audited). */
  async export10BD(actorId: string, orgId: string, fy: string) {
    this.assertFy(fy);
    const profile = await this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } });
    if (!profile || profile.status !== 'VERIFIED') throw new ConflictException({ statusCode: 409, code: 'NO_VERIFIED_80G', message: 'Form 10BD needs a verified 80G registration.' });
    const data = await this.yearRows(orgId, fy, true);
    let n = 0;
    const rows = data.donors.flatMap((d) => [...d.byMode.entries()].map(([mode, paise]) => ({
      'Sr. No.': ++n, 'Pre Acknowledgement Number': '', 'ID Code': DONOR_ID_TYPES[d.idType as DonorIdType].code, 'Unique Identification Number': d.idNumber,
      'Section Code': profile.sectionCode, 'Unique Registration Number (URN)': profile.urn, 'Date of Issuance of Unique Registration Number': ymd(profile.urnIssuedOn),
      'Name of Donor': d.name, 'Address of Donor': d.address ?? '', 'Donation Type': 'Others', 'Mode of receipt': mode, 'Amount of donation (Indian rupees)': (paise / 100).toFixed(2),
    })));
    await this.audit.log({ organizationId: orgId, actorId, action: 'tax.form_10bd_exported', entityType: 'Organization', entityId: orgId, after: { financialYear: fy, rows: rows.length, donors: data.donors.length } });
    return toCsv(rows);
  }

  /** Records that Form 10BD was filed on the portal (a later filing for the same year supersedes it — a correction). */
  async file10BD(actorId: string, orgId: string, fy: string, dto: File10BDDto) {
    this.assertFy(fy);
    const profile = await this.prisma.orgTaxProfile.findUnique({ where: { organizationId: orgId } });
    if (!profile || profile.status !== 'VERIFIED') throw new ConflictException({ statusCode: 409, code: 'NO_VERIFIED_80G', message: 'Form 10BD needs a verified 80G registration.' });
    const data = await this.yearRows(orgId, fy, false);
    if (!data.donors.length) throw new ConflictException({ statusCode: 409, code: 'NOTHING_TO_FILE', message: 'No 80G-eligible donations in this year.' });
    await this.prisma.$transaction(async (tx) => {
      const prev = await tx.form10BDFiling.findFirst({ where: { organizationId: orgId, financialYear: fy, status: { not: 'SUPERSEDED' } } });
      if (prev) await tx.form10BDFiling.update({ where: { id: prev.id }, data: { status: 'SUPERSEDED' } });
      const f = await tx.form10BDFiling.create({
        data: {
          organizationId: orgId, financialYear: fy, ackNumber: dto.ackNumber.trim(), filedOn: dateOnly(dto.filedOn), filedById: actorId,
          donorCount: data.donors.length, donationCount: data.eligibleCount, totalPaise: data.donors.reduce((n, d) => n + d.totalPaise, 0),
          donationIds: data.donors.flatMap((d) => d.donationIds),
        },
      });
      await this.audit.log({ organizationId: orgId, actorId, action: prev ? 'tax.form_10bd_corrected' : 'tax.form_10bd_filed', entityType: 'Form10BDFiling', entityId: f.id, after: { financialYear: fy, ackNumber: f.ackNumber, donors: f.donorCount, total: rupees(f.totalPaise) } }, tx);
    });
    return this.year(orgId, fy);
  }

  /** Records a Form 10BE certificate downloaded from the portal and given to one donor (re-issue = new version). */
  async issue10BE(actorId: string, orgId: string, fy: string, dto: Issue10BEDto) {
    this.assertFy(fy);
    const y = await this.year(orgId, fy);
    const donor = y.donors.find((d) => d.donorKey === dto.donorKey);
    if (!donor) throw new NotFoundException('Donor not found in this year’s 80G donations.');
    if (y.filing?.status !== 'FILED') throw new ConflictException({ statusCode: 409, code: 'FILE_10BD_FIRST', message: y.filing?.status === 'REVISION_NEEDED' ? 'File the corrected Form 10BD first.' : 'File Form 10BD for this year first — Form 10BE comes from the portal after that.' });
    if (donor.form10BE.status === 'AWAITING_10BD') throw new ConflictException({ statusCode: 409, code: 'NOT_IN_FILED_10BD', message: 'This donor’s donations aren’t all in the filed Form 10BD — file a correction first.' });
    await this.prisma.$transaction(async (tx) => {
      const prev = await tx.donationDocument.findFirst({ where: { organizationId: orgId, kind: 'FORM_10BE', financialYear: fy, donorIdHash: dto.donorKey }, orderBy: { version: 'desc' } });
      if (prev?.status === 'ISSUED') await tx.donationDocument.update({ where: { id: prev.id }, data: { status: 'SUPERSEDED', closedAt: new Date(), closeReason: 'Re-issued' } });
      const doc = await tx.donationDocument.create({
        data: {
          organizationId: orgId, kind: 'FORM_10BE', financialYear: fy, donorIdHash: dto.donorKey, docNo: dto.certificateNumber.trim(), version: (prev?.version ?? 0) + 1, issuedById: actorId,
          issuedAt: new Date(`${dto.issuedOn}T00:00:00.000Z`),
          snapshot: { donor: donor.name, donorId: donor.donorId, total: donor.total, receipts: donor.receipts, financialYear: fy, form10BDAck: y.filing!.ackNumber },
        },
      });
      await this.audit.log({ organizationId: orgId, actorId, action: prev ? 'tax.form_10be_reissued' : 'tax.form_10be_issued', entityType: 'DonationDocument', entityId: doc.id, after: { financialYear: fy, certificateNumber: doc.docNo, version: doc.version, donorId: donor.donorId } }, tx);
    });
    return this.year(orgId, fy);
  }
}
