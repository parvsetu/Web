import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS } from '../../common/permissions';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { RequestUser } from '../../common/auth/request-user';
import { ymd } from '../../common/time/validity';
import { ApplyDto, ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';

export const BCRYPT_ROUNDS = 10;
// Compared against when the identifier doesn't exist, so response time
// doesn't reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

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
    // Registration grants NO permissions — only an application for review.
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.name.trim(), mobile, email, passwordHash } });
      if (dto.organizationId) {
        await tx.volunteerApplication.create({
          data: { userId: u.id, organizationId: dto.organizationId, eventId: dto.eventId ?? null, message: dto.message ?? null },
        });
      }
      return u;
    });
    return { accessToken: this.sign(user.id, user.tokenVersion), user: await this.me(this.toRequestUser(user)) };
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const where = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { mobile: identifier.replace(/[\s\-()]/g, '') };
    const user = await this.prisma.user.findUnique({ where });
    const ok = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');
    return { accessToken: this.sign(user.id, user.tokenVersion), user: await this.me(this.toRequestUser(user)) };
  }

  async changePassword(actor: RequestUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS), tokenVersion: { increment: 1 } },
    });
  }

  async apply(actor: RequestUser, dto: ApplyDto) {
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
        where: { id: eventId, organizationId, volunteerRegistrationOpen: true, status: { in: ['DRAFT', 'ACTIVE'] } },
        select: { id: true },
      });
      if (!ev) throw new NotFoundException('This event is not accepting volunteer registrations');
    }
  }

  async me(actor: RequestUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        id: true, name: true, mobile: true, email: true, isSuperAdmin: true, status: true,
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
      isSuperAdmin: user.isSuperAdmin, status: user.status,
      organizations,
      events: eventsOut,
      applications: await this.myApplications(actor),
    };
  }

  sign(userId: string, tokenVersion: number) {
    return this.jwt.sign({ sub: userId, ver: tokenVersion });
  }

  private toRequestUser(u: { id: string; name: string; isSuperAdmin: boolean }): RequestUser {
    return { id: u.id, name: u.name, isSuperAdmin: u.isSuperAdmin };
  }
}

export const applicationSelect = {
  id: true, status: true, message: true, reviewNote: true, createdAt: true, reviewedAt: true,
  organization: { select: { id: true, name: true } },
  event: { select: { id: true, name: true } },
} as const;
