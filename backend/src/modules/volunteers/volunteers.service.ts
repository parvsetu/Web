import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessService } from '../../common/access/access.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail } from '../../common/identity';
import { paged, paging, searchTerm } from '../../common/http';
import { RolesService } from '../organizations/roles.service';
import { UserProvisioningService } from '../organizations/user-provisioning.service';
import { ApplicationListQuery, ApproveApplicationDto, CreateVolunteerDto, UpdateVolunteerDto, VolunteerListQuery } from './volunteers.dto';

@Injectable()
export class VolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly roles: RolesService,
    private readonly users: UserProvisioningService,
  ) {}

  /** The actor's permissions on an event that must belong to `orgId`. */
  private async eventPermsInOrg(actor: RequestUser, orgId: string, eventId: string) {
    const ctx = await this.access.eventAccess(actor, eventId);
    if (!ctx || ctx.organizationId !== orgId || ctx.perms.size === 0) throw new NotFoundException('Event not found');
    if (!ctx.perms.has('VOLUNTEER_ASSIGN')) {
      throw new ForbiddenException({ statusCode: 403, message: 'You cannot assign volunteers to this event.', code: 'FORBIDDEN' });
    }
    return ctx;
  }

  async list(orgId: string, q: VolunteerListQuery) {
    const assignmentWhere: Prisma.EventAssignmentWhereInput = {
      event: { organizationId: orgId }, eventId: q.eventId, status: q.status,
    };
    const { page, pageSize, skip, take } = paging(q);
    const t = searchTerm(q.q);
    const where: Prisma.UserWhereInput = {
      assignments: { some: assignmentWhere },
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { mobile: { contains: t } }, { email: { contains: t, mode: 'insensitive' } }] } : {}),
    };
    const [users, total] = await Promise.all([this.prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip, take,
      select: {
        id: true, name: true, mobile: true, email: true, status: true,
        assignments: {
          where: { event: { organizationId: orgId } },
          select: { id: true, status: true, eventId: true, event: { select: { name: true } }, role: { select: { id: true, key: true, name: true } } },
        },
      },
    }), this.prisma.user.count({ where })]);
    return paged(users.map((u) => this.present(u)), total, page, pageSize);
  }

  private present(u: { id: string; name: string; mobile: string; email: string | null; status: string; assignments: { id: string; status: string; eventId: string; event: { name: string }; role: { id: string; key: string; name: string } }[] }) {
    return {
      userId: u.id, name: u.name, mobile: u.mobile, email: u.email, accountStatus: u.status,
      assignments: u.assignments.map((a) => ({ id: a.id, eventId: a.eventId, eventName: a.event.name, role: a.role, status: a.status })),
    };
  }

  private async getOne(orgId: string, userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, assignments: { some: { event: { organizationId: orgId } } } },
      select: {
        id: true, name: true, mobile: true, email: true, status: true,
        assignments: {
          where: { event: { organizationId: orgId } },
          select: { id: true, status: true, eventId: true, event: { select: { name: true } }, role: { select: { id: true, key: true, name: true, permissions: { select: { permissionKey: true } } } } },
        },
      },
    });
    if (!u) throw new NotFoundException('Volunteer not found');
    return u;
  }

  async create(actor: RequestUser, orgId: string, dto: CreateVolunteerDto) {
    const ctx = await this.eventPermsInOrg(actor, orgId, dto.eventId);
    const role = dto.roleId ? await this.roles.findAssignable(orgId, dto.roleId) : await this.roles.systemRole('VOLUNTEER');
    this.roles.assertCanGrant(ctx.perms, role);

    const result = await this.prisma.$transaction(async (tx) => {
      const { user, created, temporaryPassword } = await this.users.findOrCreate(tx, dto);
      if (user.id === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot assign a role to yourself.', code: 'SELF_CHANGE' });
      const existing = await tx.eventAssignment.findUnique({ where: { eventId_userId: { eventId: dto.eventId, userId: user.id } } });
      if (existing) throw new ConflictException({ message: 'This person is already a volunteer for this event.', code: 'ALREADY_ASSIGNED' });
      const a = await tx.eventAssignment.create({
        data: { eventId: dto.eventId, userId: user.id, roleId: role.id, status: dto.status ?? 'ACTIVE', assignedById: actor.id },
      });
      await this.audit.log({
        organizationId: orgId, eventId: dto.eventId, actorId: actor.id, action: 'volunteer.created', entityType: 'User', entityId: user.id,
        after: { accountCreated: created, role: role.key, assignmentStatus: a.status },
      }, tx);
      return { userId: user.id, temporaryPassword };
    });
    return { volunteer: this.present(await this.getOne(orgId, result.userId)), temporaryPassword: result.temporaryPassword };
  }

  /**
   * Profile edits change a global account, so they're only allowed when the
   * person belongs to no other mandal — one org admin can't rename someone
   * another mandal also relies on.
   */
  async update(actor: RequestUser, orgId: string, userId: string, dto: UpdateVolunteerDto) {
    const u = await this.getOne(orgId, userId);
    const elsewhere = await this.prisma.user.count({
      where: {
        id: userId,
        OR: [
          { memberships: { some: { organizationId: { not: orgId } } } },
          { assignments: { some: { event: { organizationId: { not: orgId } } } } },
          { applications: { some: { organizationId: { not: orgId } } } },
        ],
      },
    });
    if (elsewhere > 0 && !actor.isSuperAdmin) {
      throw new ForbiddenException({ statusCode: 403, message: 'This person is also part of another mandal; only they can edit their profile.', code: 'SHARED_ACCOUNT' });
    }
    const email = dto.email !== undefined ? normalizeEmail(dto.email) : undefined;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { name: dto.name?.trim(), email, emailVerifiedAt: email !== undefined && email !== u.email ? null : undefined },
      });
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: 'volunteer.updated', entityType: 'User', entityId: userId,
        before: { name: u.name, email: u.email }, after: { name: updated.name, email: updated.email },
      }, tx);
      return this.present(await this.getOne(orgId, userId));
    });
  }

  /** (De)activates every assignment the person has in this mandal's events. */
  async setActive(actor: RequestUser, actorOrgPerms: Set<string>, orgId: string, userId: string, active: boolean, reason?: string) {
    if (userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot change your own status.', code: 'SELF_CHANGE' });
    const u = await this.getOne(orgId, userId);
    for (const a of u.assignments) {
      this.roles.assertCanGrant(actorOrgPerms, { id: a.role.id, key: a.role.key, name: a.role.name, permissions: a.role.permissions.map((p) => p.permissionKey) });
    }
    const status = active ? 'ACTIVE' : 'INACTIVE';
    await this.prisma.$transaction(async (tx) => {
      await tx.eventAssignment.updateMany({ where: { userId, event: { organizationId: orgId } }, data: { status } });
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: active ? 'volunteer.activated' : 'volunteer.deactivated',
        entityType: 'User', entityId: userId,
        before: u.assignments.map((a) => ({ eventId: a.eventId, status: a.status })),
        after: u.assignments.map((a) => ({ eventId: a.eventId, status })),
        reason,
      }, tx);
    });
    return this.present(await this.getOne(orgId, userId));
  }

  // ─── Applications ────────────────────────────────────────────────────

  async applications(orgId: string, q: ApplicationListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const t = searchTerm(q.q);
    const where: Prisma.VolunteerApplicationWhereInput = {
      organizationId: orgId, status: q.status,
      ...(t ? { user: { OR: [{ name: { contains: t, mode: 'insensitive' } }, { mobile: { contains: t } }, { email: { contains: t, mode: 'insensitive' } }] } } : {}),
    };
    const [items, total] = await Promise.all([this.prisma.volunteerApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take,
      select: {
        id: true, status: true, message: true, reviewNote: true, createdAt: true, reviewedAt: true,
        user: { select: { id: true, name: true, mobile: true, email: true, emailVerifiedAt: true } },
        event: { select: { id: true, name: true } },
      },
    }), this.prisma.volunteerApplication.count({ where })]);
    return paged(items, total, page, pageSize);
  }

  async approve(actor: RequestUser, orgId: string, applicationId: string, dto: ApproveApplicationDto) {
    const ctx = await this.eventPermsInOrg(actor, orgId, dto.eventId);
    const role = await this.roles.findAssignable(orgId, dto.roleId);
    this.roles.assertCanGrant(ctx.perms, role);

    return this.prisma.$transaction(async (tx) => {
      const app = await tx.volunteerApplication.findFirst({ where: { id: applicationId, organizationId: orgId } });
      if (!app) throw new NotFoundException('Application not found');
      if (app.userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot approve your own application.', code: 'SELF_CHANGE' });
      // Conditional transition: two admins approving at once can't both win.
      const claimed = await tx.volunteerApplication.updateMany({
        where: { id: applicationId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date(), eventId: dto.eventId },
      });
      if (claimed.count !== 1) throw new ConflictException({ message: 'This application has already been reviewed.', code: 'ALREADY_REVIEWED' });

      const assignment = await tx.eventAssignment.upsert({
        where: { eventId_userId: { eventId: dto.eventId, userId: app.userId } },
        create: { eventId: dto.eventId, userId: app.userId, roleId: role.id, assignedById: actor.id },
        update: { roleId: role.id, status: 'ACTIVE', assignedById: actor.id },
      });
      await this.audit.log({
        organizationId: orgId, eventId: dto.eventId, actorId: actor.id, action: 'volunteer.application_approved',
        entityType: 'VolunteerApplication', entityId: applicationId,
        before: { status: 'PENDING' }, after: { status: 'APPROVED', userId: app.userId, role: role.key, assignmentId: assignment.id },
      }, tx);
      return { id: applicationId, status: 'APPROVED', assignmentId: assignment.id };
    });
  }

  async reject(actor: RequestUser, orgId: string, applicationId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.volunteerApplication.findFirst({ where: { id: applicationId, organizationId: orgId } });
      if (!app) throw new NotFoundException('Application not found');
      const claimed = await tx.volunteerApplication.updateMany({
        where: { id: applicationId, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote: reason ?? null },
      });
      if (claimed.count !== 1) throw new ConflictException({ message: 'This application has already been reviewed.', code: 'ALREADY_REVIEWED' });
      await this.audit.log({
        organizationId: orgId, eventId: app.eventId, actorId: actor.id, action: 'volunteer.application_rejected',
        entityType: 'VolunteerApplication', entityId: applicationId, before: { status: 'PENDING' }, after: { status: 'REJECTED' }, reason,
      }, tx);
      return { id: applicationId, status: 'REJECTED' };
    });
  }
}
