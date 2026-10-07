import { ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Vendor } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { BCRYPT_ROUNDS } from '../auth/auth.service';
import { OtpService, maskEmail } from '../auth/otp.service';
import { AdminVendorQuery, UpdateVendorDto, VendorSignupDto } from './stalls.dto';
import { VendorCtx } from './vendor.guard';

export function presentVendor(v: Vendor) {
  return {
    id: v.id, businessName: v.businessName, contactName: v.contactName, contactEmail: v.contactEmail, contactPhone: v.contactPhone,
    category: v.category, description: v.description, city: v.city, gstin: v.gstin, status: v.status, statusNote: v.statusNote,
    createdAt: v.createdAt,
  };
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.replace(/\s+/g, ' ').trim() || null);

/**
 * Stall-vendor accounts. Like promotional partners, a vendor signs up on its
 * own (User.vendorId → Vendor) and has no mandal membership; unlike partners
 * there is no approval step — the account is usable once the email is
 * verified, and paying online is what confirms a booking. The super admin can
 * suspend a vendor (read-only from then on).
 */
@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly otp: OtpService) {}

  async signup(dto: VendorSignupDto) {
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email)!;
    if (await this.prisma.user.findUnique({ where: { mobile } })) {
      throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    }
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.create({
        data: {
          businessName: clean(dto.businessName)!, contactName: clean(dto.contactName)!, contactEmail: email, contactPhone: mobile,
          category: dto.category ?? null, city: clean(dto.city) ?? null, gstin: dto.gstin || null,
        },
      });
      // Locked until the emailed code is entered (same flow as partner / volunteer signup).
      const u = await tx.user.create({ data: { name: clean(dto.contactName)!, mobile, email, passwordHash, requiresEmailVerification: true, vendorId: v.id } });
      await this.audit.log({ actorId: u.id, action: 'vendor.signed_up', entityType: 'Vendor', entityId: v.id, after: { businessName: v.businessName, email } }, tx);
      return u;
    });
    try {
      await this.otp.issue({ id: user.id, name: user.name, email }, 'VERIFY_EMAIL');
    } catch (e) {
      if (!(e instanceof HttpException && e.getStatus() === 429)) throw e;
    }
    return { verificationRequired: true, email, maskedEmail: maskEmail(email) };
  }

  async profile(vendor: VendorCtx) {
    return presentVendor(await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } }));
  }

  async updateProfile(actor: RequestUser, vendor: VendorCtx, dto: UpdateVendorDto) {
    const before = await this.prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } });
    const data: Prisma.VendorUpdateInput = {
      businessName: dto.businessName === undefined ? undefined : clean(dto.businessName)!,
      contactName: dto.contactName === undefined ? undefined : clean(dto.contactName)!,
      contactPhone: dto.contactPhone === undefined ? undefined : normalizeMobile(dto.contactPhone),
      category: dto.category, city: clean(dto.city), gstin: dto.gstin === undefined ? undefined : dto.gstin || null,
      description: dto.description === undefined ? undefined : dto.description?.trim() || null,
    };
    const after = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({ where: { id: vendor.id }, data });
      await this.audit.log({ actorId: actor.id, action: 'vendor.profile_updated', entityType: 'Vendor', entityId: v.id, before: presentVendor(before), after: presentVendor(v) }, tx);
      return v;
    });
    return presentVendor(after);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  async list(q: AdminVendorQuery) {
    const { page, pageSize, skip, take } = paging(q, 25);
    const t = searchTerm(q.q);
    const where: Prisma.VendorWhereInput = {
      status: q.status,
      ...(t ? { OR: [{ businessName: { contains: t, mode: 'insensitive' } }, { contactName: { contains: t, mode: 'insensitive' } }, { contactEmail: { contains: t, mode: 'insensitive' } }, { contactPhone: { contains: t } }, { city: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.vendor.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.vendor.count({ where }),
    ]);
    const stats = rows.length
      ? await this.prisma.stallBooking.groupBy({ by: ['vendorId'], where: { vendorId: { in: rows.map((r) => r.id) }, status: 'PAID' }, _count: { _all: true }, _sum: { amountPaise: true } })
      : [];
    return paged(
      rows.map((v) => {
        const s = stats.find((x) => x.vendorId === v.id);
        return { ...presentVendor(v), paidBookings: s?._count._all ?? 0, paidAmount: ((s?._sum.amountPaise ?? 0) / 100).toFixed(2) };
      }),
      total, page, pageSize,
    );
  }

  async setStatus(actorId: string, vendorId: string, status: 'ACTIVE' | 'SUSPENDED', note?: string) {
    const before = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!before) throw new NotFoundException('Vendor not found');
    const after = await this.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({ where: { id: vendorId }, data: { status, statusNote: note?.trim() || null } });
      await this.audit.log({ actorId, action: 'vendor.status_changed', entityType: 'Vendor', entityId: vendorId, before: { status: before.status }, after: { status }, reason: note }, tx);
      return v;
    });
    return presentVendor(after);
  }
}
