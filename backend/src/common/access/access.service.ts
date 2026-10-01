import { Injectable } from '@nestjs/common';
import { EventApprovalStatus, EventStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ALL_PERMISSIONS, Permission } from '../permissions';
import { RequestUser } from '../auth/request-user';

export interface EventRef {
  id: string;
  organizationId: string;
  name: string;
  status: EventStatus;
  approvalStatus: EventApprovalStatus;
  timezone: string;
  startDate: Date;
  endDate: Date;
  tokenPrefix: string;
  maxVisitorsPerToken: number;
}

export interface AccessContext {
  organizationId: string;
  event: EventRef | null;
  perms: Set<string>;
}

const EVENT_REF_SELECT = {
  id: true, organizationId: true, name: true, status: true, approvalStatus: true, timezone: true,
  startDate: true, endDate: true, tokenPrefix: true, maxVisitorsPerToken: true,
} as const;

/**
 * The one place effective permissions are computed. Every authorization
 * decision (guard, scan service, report field-gating) goes through here.
 *
 *   org scope   = permissions of the user's ACTIVE org membership role
 *   event scope = org scope ∪ permissions of the user's ACTIVE assignment for
 *                 that exact event
 *   super admin = everything
 *
 * Nothing about role/permissions/event is ever taken from the client.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async orgPermissions(user: RequestUser, organizationId: string): Promise<Set<string>> {
    if (user.isSuperAdmin) return new Set(ALL_PERMISSIONS);
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { status: true, role: { select: { permissions: { select: { permissionKey: true } } } } },
    });
    if (!membership || membership.status !== 'ACTIVE') return new Set();
    return new Set(membership.role.permissions.map((p) => p.permissionKey));
  }

  /** Returns null when the event doesn't exist. */
  async eventAccess(user: RequestUser, eventId: string): Promise<AccessContext | null> {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: EVENT_REF_SELECT });
    if (!event) return null;
    if (user.isSuperAdmin) {
      return { organizationId: event.organizationId, event, perms: new Set(ALL_PERMISSIONS) };
    }
    const [orgPerms, assignment] = await Promise.all([
      this.orgPermissions(user, event.organizationId),
      this.prisma.eventAssignment.findUnique({
        where: { eventId_userId: { eventId, userId: user.id } },
        select: { status: true, role: { select: { permissions: { select: { permissionKey: true } } } } },
      }),
    ]);
    const perms = new Set(orgPerms);
    if (assignment?.status === 'ACTIVE') {
      for (const p of assignment.role.permissions) perms.add(p.permissionKey);
    }
    return { organizationId: event.organizationId, event, perms };
  }

  async orgAccess(user: RequestUser, organizationId: string): Promise<AccessContext | null> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
    if (!org) return null;
    return { organizationId, event: null, perms: await this.orgPermissions(user, organizationId) };
  }

  /**
   * Role-escalation guard: an actor may only grant a role whose permissions
   * are all within the actor's own permission set at that scope.
   */
  canGrant(actorPerms: Set<string>, rolePerms: string[]): boolean {
    return rolePerms.every((p) => actorPerms.has(p));
  }

  has(perms: Set<string>, p: Permission) {
    return perms.has(p);
  }
}
