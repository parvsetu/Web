import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '../permissions';
import { AccessService } from './access.service';
import { RequestUser } from '../auth/request-user';

interface PermissionRequirement {
  scope: 'event' | 'org' | 'platform';
  perms: Permission[];
  mode: 'all' | 'any';
}

const REQUIREMENT = 'permissionRequirement';

/** Requires the permission(s) on the event named by `:eventId` (or body.eventId). */
export const RequireEventPermission = (...perms: Permission[]) =>
  SetMetadata(REQUIREMENT, { scope: 'event', perms, mode: 'all' } satisfies PermissionRequirement);
/** Like RequireEventPermission but any one of the listed permissions suffices. */
export const RequireAnyEventPermission = (...perms: Permission[]) =>
  SetMetadata(REQUIREMENT, { scope: 'event', perms, mode: 'any' } satisfies PermissionRequirement);
/** Requires the permission(s) via org membership on `:orgId`. */
export const RequireOrgPermission = (...perms: Permission[]) =>
  SetMetadata(REQUIREMENT, { scope: 'org', perms, mode: 'all' } satisfies PermissionRequirement);
export const SuperAdminOnly = () =>
  SetMetadata(REQUIREMENT, { scope: 'platform', perms: [], mode: 'all' } satisfies PermissionRequirement);

/**
 * Declarative, server-side authorization. Resolves the AccessContext once and
 * attaches it as `request.access` (read it with `@Access()`), so handlers can
 * do finer-grained checks (e.g. report field gating) without re-querying.
 *
 * A user with zero permissions on an event/org gets 404, not 403 — the
 * existence of another mandal's events is not disclosed.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly access: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(REQUIREMENT, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true;
    const user: RequestUser | undefined = req.user;
    if (!user) return false;

    if (requirement.scope === 'platform') {
      if (!user.isSuperAdmin) throw new ForbiddenException('Platform administrators only');
      return true;
    }

    let ctx;
    if (requirement.scope === 'event') {
      const eventId = req.params?.eventId ?? req.body?.eventId ?? req.query?.eventId;
      if (typeof eventId !== 'string' || !eventId) throw new NotFoundException('Event not found');
      ctx = await this.access.eventAccess(user, eventId);
      if (!ctx || ctx.perms.size === 0) throw new NotFoundException('Event not found');
    } else {
      const orgId = req.params?.orgId;
      if (typeof orgId !== 'string' || !orgId) throw new NotFoundException('Organization not found');
      ctx = await this.access.orgAccess(user, orgId);
      if (!ctx || ctx.perms.size === 0) throw new NotFoundException('Organization not found');
    }

    const ok =
      requirement.mode === 'all'
        ? requirement.perms.every((p) => ctx.perms.has(p))
        : requirement.perms.some((p) => ctx.perms.has(p));
    if (!ok) {
      throw new ForbiddenException({ statusCode: 403, message: 'You do not have permission to do this.', code: 'FORBIDDEN' });
    }
    req.access = ctx;
    return true;
  }
}
