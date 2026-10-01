import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessService } from '../../common/access/access.service';
import { ALL_PERMISSIONS } from '../../common/permissions';
import { RequestUser } from '../../common/auth/request-user';

export interface AssignableRole {
  id: string;
  key: string;
  name: string;
  permissions: string[];
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** A role usable in this org: a system role or one of the org's own. */
  async findAssignable(organizationId: string, roleId: string): Promise<AssignableRole> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, OR: [{ organizationId: null, isSystem: true }, { organizationId }] },
      select: { id: true, key: true, name: true, permissions: { select: { permissionKey: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    return { id: role.id, key: role.key, name: role.name, permissions: role.permissions.map((p) => p.permissionKey) };
  }

  async systemRole(key: string): Promise<AssignableRole> {
    const role = await this.prisma.role.findFirst({
      where: { organizationId: null, isSystem: true, key },
      select: { id: true, key: true, name: true, permissions: { select: { permissionKey: true } } },
    });
    if (!role) throw new Error(`System role ${key} missing — run the seed`);
    return { id: role.id, key: role.key, name: role.name, permissions: role.permissions.map((p) => p.permissionKey) };
  }

  /** Throws unless every permission of `role` is within the actor's own set. */
  assertCanGrant(actorPerms: Set<string>, role: AssignableRole) {
    if (!this.access.canGrant(actorPerms, role.permissions)) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'You cannot grant a role with permissions you do not have yourself.',
        code: 'ROLE_ESCALATION',
      });
    }
  }

  async list(organizationId: string) {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ organizationId: null, isSystem: true }, { organizationId }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: {
        id: true, key: true, name: true, description: true, isSystem: true, organizationId: true,
        permissions: { select: { permissionKey: true } },
        _count: {
          select: {
            memberships: { where: { organizationId } },
            assignments: { where: { event: { organizationId } } },
          },
        },
      },
    });
    return roles.map(({ _count, permissions, ...r }) => ({
      ...r,
      permissions: permissions.map((p) => p.permissionKey).sort(),
      memberCount: _count.memberships,
      assignmentCount: _count.assignments,
    }));
  }

  private validatePermissions(perms: string[]) {
    const unknown = perms.filter((p) => !(ALL_PERMISSIONS as string[]).includes(p));
    if (unknown.length) throw new BadRequestException(`Unknown permissions: ${unknown.join(', ')}`);
    return [...new Set(perms)];
  }

  async create(actor: RequestUser, actorPerms: Set<string>, organizationId: string, dto: { name: string; description?: string; permissions: string[] }) {
    const perms = this.validatePermissions(dto.permissions);
    this.assertCanGrant(actorPerms, { id: '', key: '', name: dto.name, permissions: perms });
    const key = `${dto.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'ROLE'}_${randomBytes(3).toString('hex').toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({
        data: {
          organizationId, key, name: dto.name.trim(), description: dto.description ?? null,
          permissions: { create: perms.map((permissionKey) => ({ permissionKey })) },
        },
      });
      await this.audit.log({
        organizationId, actorId: actor.id, action: 'role.created', entityType: 'Role', entityId: role.id,
        after: { name: role.name, permissions: perms },
      }, tx);
      return { ...role, permissions: perms };
    });
  }

  async update(actor: RequestUser, actorPerms: Set<string>, organizationId: string, roleId: string, dto: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: { permissions: true },
    });
    if (!role) throw new NotFoundException('Role not found (system roles cannot be edited)');
    const before = { name: role.name, description: role.description, permissions: role.permissions.map((p) => p.permissionKey).sort() };
    const perms = dto.permissions ? this.validatePermissions(dto.permissions) : before.permissions;
    if (dto.permissions) this.assertCanGrant(actorPerms, { id: role.id, key: role.key, name: role.name, permissions: perms });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({
        where: { id: roleId },
        data: { name: dto.name?.trim() ?? undefined, description: dto.description ?? undefined },
      });
      if (dto.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId } });
        await tx.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId, permissionKey })) });
      }
      await this.audit.log({
        organizationId, actorId: actor.id, action: 'role.updated', entityType: 'Role', entityId: roleId,
        before, after: { name: updated.name, description: updated.description, permissions: [...perms].sort() },
      }, tx);
      return { ...updated, permissions: [...perms].sort() };
    });
  }

  async remove(actor: RequestUser, organizationId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, organizationId },
      include: { _count: { select: { memberships: true, assignments: true } }, permissions: true },
    });
    if (!role) throw new NotFoundException('Role not found (system roles cannot be deleted)');
    if (role._count.memberships + role._count.assignments > 0) {
      throw new ConflictException({ message: 'This role is still assigned to people. Reassign them first.', code: 'ROLE_IN_USE' });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: roleId } });
      await this.audit.log({
        organizationId, actorId: actor.id, action: 'role.deleted', entityType: 'Role', entityId: roleId,
        before: { name: role.name, permissions: role.permissions.map((p) => p.permissionKey) },
      }, tx);
    });
  }
}
