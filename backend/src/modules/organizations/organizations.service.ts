import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { SearchPageQuery, paged, paging, searchTerm, userRef } from '../../common/http';
import { Prisma } from '@prisma/client';
import { canonicalState } from '../../common/india-locations';
import { RolesService } from './roles.service';
import { UserProvisioningService } from './user-provisioning.service';
import { AddMemberDto, AuditQuery, CreateOrganizationDto, UpdateMemberDto, UpdateOrganizationDto } from './organizations.dto';

/** Validates a state against the India list; empty string clears it. */
export function stateOrThrow(state: string | undefined): string | null | undefined {
  if (state === undefined) return undefined;
  if (state.trim() === '') return null;
  const s = canonicalState(state);
  if (!s) throw new BadRequestException(`Unknown state "${state}"`);
  return s;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly roles: RolesService,
    private readonly users: UserProvisioningService,
  ) {}

  async list(actor: RequestUser, q: SearchPageQuery & { state?: string } = {}) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const where: Prisma.OrganizationWhereInput = {
      ...(actor.isSuperAdmin ? {} : { members: { some: { userId: actor.id, status: 'ACTIVE' } } }),
      state: q.state || undefined,
      ...(t ? { OR: [{ name: { contains: t, mode: 'insensitive' } }, { city: { contains: t, mode: 'insensitive' } }, { slug: { contains: t.toLowerCase() } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.organization.findMany({
        where, orderBy: { name: 'asc' }, skip, take,
        select: { id: true, name: true, slug: true, state: true, city: true, address: true, createdAt: true, _count: { select: { events: true } } },
      }),
      this.prisma.organization.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  async get(orgId: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, state: true, city: true, address: true, festivalTypes: true, createdAt: true },
    });
  }

  async create(actor: RequestUser, dto: CreateOrganizationDto) {
    const slug = dto.slug ?? (await this.uniqueSlug(dto.name));
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: dto.name.trim(), slug, state: stateOrThrow(dto.state), city: dto.city?.trim(), address: dto.address } });
      await this.audit.log({ organizationId: org.id, actorId: actor.id, action: 'organization.created', entityType: 'Organization', entityId: org.id, after: org }, tx);
      return org;
    });
  }

  async update(actor: RequestUser, orgId: string, dto: UpdateOrganizationDto) {
    const before = await this.get(orgId);
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: orgId },
        data: { name: dto.name, state: dto.state === undefined ? undefined : stateOrThrow(dto.state), city: dto.city?.trim(), address: dto.address, festivalTypes: dto.festivalTypes ? [...new Set(dto.festivalTypes)] : undefined },
      });
      await this.audit.log({ organizationId: orgId, actorId: actor.id, action: 'organization.updated', entityType: 'Organization', entityId: orgId, before, after: org }, tx);
      return org;
    });
  }

  private async uniqueSlug(name: string) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'mandal';
    let slug = base;
    for (let i = 2; await this.prisma.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  // ─── Members (org-wide roles) ─────────────────────────────────────────

  async members(orgId: string, q: SearchPageQuery = {}) {
    const { page, pageSize, skip, take } = paging(q);
    const t = searchTerm(q.q);
    const where: Prisma.OrganizationMemberWhereInput = {
      organizationId: orgId,
      ...(t ? { user: { OR: [{ name: { contains: t, mode: 'insensitive' } }, { mobile: { contains: t } }, { email: { contains: t, mode: 'insensitive' } }] } } : {}),
    };
    const total = await this.prisma.organizationMember.count({ where });
    const rows = await this.prisma.organizationMember.findMany({
      where, skip, take,
      orderBy: { createdAt: 'asc' },
      select: {
        status: true, createdAt: true,
        user: { select: { id: true, name: true, mobile: true, email: true } },
        role: { select: { id: true, key: true, name: true } },
      },
    });
    return paged(
      rows.map((m) => ({ userId: m.user.id, name: m.user.name, mobile: m.user.mobile, email: m.user.email, status: m.status, role: m.role, createdAt: m.createdAt })),
      total, page, pageSize,
    );
  }

  async addMember(actor: RequestUser, actorPerms: Set<string>, orgId: string, dto: AddMemberDto) {
    const role = await this.roles.findAssignable(orgId, dto.roleId);
    this.roles.assertCanGrant(actorPerms, role);
    return this.prisma.$transaction(async (tx) => {
      const { user, temporaryPassword } = await this.users.findOrCreate(tx, dto);
      const exists = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: user.id } } });
      if (exists) throw new ConflictException({ message: 'This person is already a member of the mandal.', code: 'ALREADY_MEMBER' });
      await tx.organizationMember.create({ data: { organizationId: orgId, userId: user.id, roleId: role.id } });
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: 'member.added', entityType: 'User', entityId: user.id,
        after: { role: role.key, status: 'ACTIVE' },
      }, tx);
      return { userId: user.id, name: user.name, mobile: user.mobile, email: user.email, status: 'ACTIVE', role: { id: role.id, key: role.key, name: role.name }, temporaryPassword };
    });
  }

  /** Loads a member and refuses if the actor is acting on themselves or on
   *  someone whose role carries permissions the actor doesn't hold. */
  private async targetMember(actor: RequestUser, actorPerms: Set<string>, orgId: string, userId: string) {
    if (userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot change your own role or status.', code: 'SELF_CHANGE' });
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: { role: { include: { permissions: true } } },
    });
    if (!member) throw new NotFoundException('Member not found');
    this.roles.assertCanGrant(actorPerms, {
      id: member.role.id, key: member.role.key, name: member.role.name,
      permissions: member.role.permissions.map((p) => p.permissionKey),
    });
    return member;
  }

  async updateMember(actor: RequestUser, actorPerms: Set<string>, orgId: string, userId: string, dto: UpdateMemberDto) {
    const member = await this.targetMember(actor, actorPerms, orgId, userId);
    let roleId = member.roleId;
    let roleKey = member.role.key;
    if (dto.roleId && dto.roleId !== member.roleId) {
      const role = await this.roles.findAssignable(orgId, dto.roleId);
      this.roles.assertCanGrant(actorPerms, role);
      roleId = role.id;
      roleKey = role.key;
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationMember.update({
        where: { id: member.id },
        data: { roleId, status: dto.status ?? undefined },
      });
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: 'member.updated', entityType: 'User', entityId: userId,
        before: { role: member.role.key, status: member.status }, after: { role: roleKey, status: updated.status },
        reason: dto.reason,
      }, tx);
      return { userId, status: updated.status, roleId };
    });
  }

  async removeMember(actor: RequestUser, actorPerms: Set<string>, orgId: string, userId: string) {
    const member = await this.targetMember(actor, actorPerms, orgId, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationMember.delete({ where: { id: member.id } });
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: 'member.removed', entityType: 'User', entityId: userId,
        before: { role: member.role.key, status: member.status },
      }, tx);
    });
  }

  async auditLogs(orgId: string, q: AuditQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const t = searchTerm(q.q);
    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId, eventId: q.eventId, action: q.action ? { startsWith: q.action } : undefined,
      ...(t ? { OR: [{ action: { contains: t, mode: 'insensitive' } }, { entityType: { contains: t, mode: 'insensitive' } }, { reason: { contains: t, mode: 'insensitive' } }, { actor: { name: { contains: t, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        select: { id: true, action: true, entityType: true, entityId: true, before: true, after: true, reason: true, createdAt: true, eventId: true, actor: userRef },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }
}
