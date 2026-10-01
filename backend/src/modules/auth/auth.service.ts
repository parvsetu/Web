import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../../common/permissions';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { RequestUser } from '../../common/auth/request-user';
import { ymd } from '../../common/time/validity';
import { ApplyDto, ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto, UpdateProfileDto } from './auth.dto';
import { OtpService, maskEmail } from './otp.service';
import { activateRegistrations } from '../registrations/activate';

export const BCRYPT_ROUNDS = 10;
// Compared against when the identifier doesn't exist, so response time
// doesn't reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly otp: OtpService) {}

  /** Best-effort send: cooldown/limit errors are swallowed where surfacing them would reveal an account. */
  private async quietIssue(user: { id: string; name: string; email: string | null }, purpose: OtpPurpose) {
    if (!user.email) return;
    try {
      await this.otp.issue({ id: user.id, name: user.name, email: user.email }, purpose);
    } catch (e) {
      if (!(e instanceof HttpException && e.getStatus() === 429)) throw e;
    }
  }

  async register(dto: RegisterDto) {
    const mobile = normalizeMobile(dto.mobile);
    const email = normalizeEmail(dto.email);
    if (await this.prisma.user.findUnique({ where: { mobile } })) {
      throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    }
    if (email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    }
    if (dto.eventId && !dto.organizationId) {
      throw new BadRequestException('organizationId is required when choosing an event');
    }
    if (dto.organizationId) await this.assertCanApply(dto.organizationId, dto.eventId);

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    // Registration grants NO permissions — only an application for review —
    // and the account stays locked until the emailed code is entered.
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.name.trim(), mobile, email, passwordHash, requiresEmailVerification: true } });
      if (dto.organizationId) {
        await tx.volunteerApplication.create({
          data: { userId: u.id, organizationId: dto.organizationId, eventId: dto.eventId ?? null, message: dto.message ?? null },
        });
      }
      return u;
    });
    await this.quietIssue(user, 'VERIFY_EMAIL');
    return { verificationRequired: true, email: email!, maskedEmail: maskEmail(email!) };
  }

  /** Activates a self-registered account (or verifies any account's email) and logs it in. */
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    const ok = user && user.status === 'ACTIVE' && await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.consume(tx, user.id, 'VERIFY_EMAIL', dto.code))) return false;
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await activateRegistrations(tx, user.id);
      return true;
    });
    if (!ok) throw new BadRequestException({ message: 'That code is wrong or has expired. Request a new one.', code: 'INVALID_CODE' });
    return { accessToken: this.sign(user.id, user.tokenVersion), user: await this.me(this.toRequestUser(user)) };
  }

  /** Always answers the same, whether or not the address has an account. */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (user && user.status === 'ACTIVE' && !user.emailVerifiedAt) await this.quietIssue(user, 'VERIFY_EMAIL');
    return { sent: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.findByIdentifier(dto.identifier);
    if (user && user.status === 'ACTIVE') await this.quietIssue(user, 'RESET_PASSWORD');
    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.findByIdentifier(dto.identifier);
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const ok = user && user.status === 'ACTIVE' && await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.consume(tx, user.id, 'RESET_PASSWORD', dto.code))) return false;
      await tx.user.update({
        where: { id: user.id },
        // The code arrived by email, so the address is proven too; old sessions are revoked.
        data: { passwordHash, tokenVersion: { increment: 1 }, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
      await activateRegistrations(tx, user.id);
      return true;
    });
    if (!ok) throw new BadRequestException({ message: 'That code is wrong or has expired. Request a new one.', code: 'INVALID_CODE' });
  }

  async sendMyVerification(actor: RequestUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!user.email) throw new BadRequestException('Add an email address to your account first.');
    if (user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    await this.otp.issue({ id: user.id, name: user.name, email: user.email }, 'VERIFY_EMAIL');
    return { sent: true, maskedEmail: maskEmail(user.email) };
  }

  async verifyMyEmail(actor: RequestUser, code: string) {
    const ok = await this.prisma.$transaction(async (tx) => {
      if (!(await this.otp.consume(tx, actor.id, 'VERIFY_EMAIL', code))) return false;
      await tx.user.update({ where: { id: actor.id }, data: { emailVerifiedAt: new Date() } });
      await activateRegistrations(tx, actor.id);
      return true;
    });
    if (!ok) throw new BadRequestException({ message: 'That code is wrong or has expired. Request a new one.', code: 'INVALID_CODE' });
    return this.me(actor);
  }

  private findByIdentifier(identifier: string) {
    const id = identifier.trim();
    return this.prisma.user.findUnique({ where: id.includes('@') ? { email: id.toLowerCase() } : { mobile: id.replace(/[\s\-()]/g, '') } });
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const where = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { mobile: identifier.replace(/[\s\-()]/g, '') };
    const user = await this.prisma.user.findUnique({ where });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');
    // Only revealed after a correct password, so it can't be used to probe accounts.
    if (user.requiresEmailVerification && !user.emailVerifiedAt) {
      await this.quietIssue(user, 'VERIFY_EMAIL');
      throw new ForbiddenException({
        statusCode: 403, code: 'EMAIL_NOT_VERIFIED', email: user.email, maskedEmail: user.email ? maskEmail(user.email) : null,
        message: 'Please verify your email to activate your account. We have sent you a code.',
      });
    }
    return { accessToken: this.sign(user.id, user.tokenVersion), user: await this.me(this.toRequestUser(user)) };
  }

  async changePassword(actor: RequestUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    // Bumping tokenVersion signs out every device; hand this one a fresh token so it stays signed in.
    const u = await this.prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
    });
    return { accessToken: this.sign(u.id, u.tokenVersion) };
  }

  /**
   * Edits the caller's own name / mobile / email. Mobile and email are login
   * ids, so changing either needs the current password; a new email starts
   * unverified and gets a code straight away.
   */
  async updateProfile(actor: RequestUser, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    const mobile = dto.mobile === undefined ? undefined : normalizeMobile(dto.mobile);
    const email = dto.email === undefined ? undefined : normalizeEmail(dto.email);
    const mobileChanged = mobile !== undefined && mobile !== user.mobile;
    const emailChanged = email !== undefined && email !== user.email;
    if (mobileChanged || emailChanged) {
      if (!dto.currentPassword || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
        throw new BadRequestException({ message: 'Enter your current password to change your mobile number or email.', code: 'PASSWORD_REQUIRED' });
      }
    }
    if (mobileChanged && (await this.prisma.user.findUnique({ where: { mobile } }))) {
      throw new ConflictException({ message: 'An account with this mobile number already exists.', code: 'MOBILE_TAKEN' });
    }
    if (emailChanged && email && (await this.prisma.user.findUnique({ where: { email } }))) {
      throw new ConflictException({ message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' });
    }
    const updated = await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        name: dto.name?.trim(),
        ...(mobileChanged ? { mobile } : {}),
        ...(emailChanged ? { email, emailVerifiedAt: null } : {}),
      },
    });
    if (emailChanged && updated.email) await this.quietIssue(updated, 'VERIFY_EMAIL');
    return { ...(await this.me(actor)), verificationSent: emailChanged && !!updated.email };
  }

  /** Signs out every other device (bumps tokenVersion) and returns a fresh token for this one. */
  async logoutOtherDevices(actor: RequestUser) {
    const u = await this.prisma.user.update({ where: { id: actor.id }, data: { tokenVersion: { increment: 1 } } });
    return { accessToken: this.sign(u.id, u.tokenVersion) };
  }

  async apply(actor: RequestUser, dto: ApplyDto) {
    if (actor.partnerId || actor.agentId) throw new ForbiddenException({ statusCode: 403, message: 'Partner and agent accounts cannot volunteer.', code: 'FORBIDDEN' });
    await this.assertCanApply(dto.organizationId, dto.eventId);
    const pending = await this.prisma.volunteerApplication.findFirst({
      where: { userId: actor.id, organizationId: dto.organizationId, status: 'PENDING' },
    });
    if (pending) throw new ConflictException({ message: 'You already have a pending application with this mandal.', code: 'APPLICATION_PENDING' });
    return this.prisma.volunteerApplication.create({
      data: { userId: actor.id, organizationId: dto.organizationId, eventId: dto.eventId ?? null, message: dto.message ?? null },
      select: applicationSelect,
    });
  }

  myApplications(actor: RequestUser) {
    return this.prisma.volunteerApplication.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      select: applicationSelect,
    });
  }

  /** Self-applications only target events that are open for sign-up. */
  private async assertCanApply(organizationId: string, eventId?: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) throw new NotFoundException('Organization not found');
    if (eventId) {
      const ev = await this.prisma.event.findFirst({
        where: { id: eventId, organizationId, volunteerRegistrationOpen: true, status: { in: ['DRAFT', 'ACTIVE'] }, approvalStatus: 'LIVE' },
        select: { id: true },
      });
      if (!ev) throw new NotFoundException('This event is not accepting volunteer registrations');
    }
  }

  async me(actor: RequestUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        id: true, name: true, mobile: true, email: true, isSuperAdmin: true, status: true, emailVerifiedAt: true,
        partner: { select: { id: true, name: true, status: true } },
        agent: { select: { id: true, name: true, code: true, status: true } },
        mandalRegistrations: {
          select: { id: true, status: true, orgName: true, organizationId: true, reviewNote: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        memberships: {
          where: { status: 'ACTIVE' },
          select: {
            organization: { select: { id: true, name: true, slug: true } },
            role: { select: { id: true, key: true, name: true, permissions: { select: { permissionKey: true } } } },
          },
        },
        assignments: {
          where: { status: 'ACTIVE' },
          select: { eventId: true, role: { select: { permissions: { select: { permissionKey: true } } } } },
        },
      },
    });

    const orgPerms = new Map<string, Set<string>>();
    let organizations;
    if (user.isSuperAdmin) {
      const orgs = await this.prisma.organization.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } });
      organizations = orgs.map((o) => ({ ...o, role: null, permissions: [...ALL_PERMISSIONS] }));
    } else {
      organizations = user.memberships.map((m) => {
        const perms = m.role.permissions.map((p) => p.permissionKey);
        orgPerms.set(m.organization.id, new Set(perms));
        return { ...m.organization, role: { id: m.role.id, key: m.role.key, name: m.role.name }, permissions: perms };
      });
    }

    const assignmentPerms = new Map(user.assignments.map((a) => [a.eventId, a.role.permissions.map((p) => p.permissionKey)]));
    const events = await this.prisma.event.findMany({
      where: user.isSuperAdmin
        ? {}
        : { OR: [{ organizationId: { in: [...orgPerms.keys()] } }, { id: { in: [...assignmentPerms.keys()] } }] },
      select: {
        id: true, name: true, festivalType: true, status: true, startDate: true, endDate: true, timezone: true,
        organization: { select: { id: true, name: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    const eventsOut = events
      .map((e) => {
        const perms = user.isSuperAdmin
          ? new Set<string>(ALL_PERMISSIONS)
          : new Set([...(orgPerms.get(e.organization.id) ?? []), ...(assignmentPerms.get(e.id) ?? [])]);
        return { ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate), permissions: [...perms].sort() };
      })
      .filter((e) => e.permissions.length > 0);

    return {
      id: user.id, name: user.name, mobile: user.mobile, email: user.email,
      isSuperAdmin: user.isSuperAdmin, status: user.status, emailVerified: !!user.emailVerifiedAt,
      // Promotional-partner (brand) account → the frontend routes it to /partner.
      partner: user.partner,
      // Field-agent account → the frontend routes it to /agent.
      agent: user.agent,
      /** Mandal registrations this user applied for (status page at /registration). */
      mandalRegistrations: user.mandalRegistrations,
      organizations,
      events: eventsOut,
      applications: await this.myApplications(actor),
    };
  }

  sign(userId: string, tokenVersion: number) {
    return this.jwt.sign({ sub: userId, ver: tokenVersion });
  }

  private toRequestUser(u: { id: string; name: string; isSuperAdmin: boolean; partnerId?: string | null; agentId?: string | null }): RequestUser {
    return { id: u.id, name: u.name, isSuperAdmin: u.isSuperAdmin, partnerId: u.partnerId ?? null, agentId: u.agentId ?? null };
  }
}

export const applicationSelect = {
  id: true, status: true, message: true, reviewNote: true, createdAt: true, reviewedAt: true,
  organization: { select: { id: true, name: true } },
  event: { select: { id: true, name: true } },
} as const;
