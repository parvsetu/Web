import { Body, Controller, ForbiddenException, Get, Param, Patch, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery, paged, paging } from '../../common/http';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

const USER_KINDS = ['SUPER_ADMIN', 'MANDAL_MEMBER', 'VOLUNTEER', 'PARTNER', 'AGENT', 'NO_ACCESS'] as const;

class UserListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** Members of / volunteers at this mandal. */
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsIn(USER_KINDS) kind?: (typeof USER_KINDS)[number];
}

class UpdateUserDto {
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
  @IsOptional() @IsBoolean() isSuperAdmin?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

const userSelect = { id: true, name: true, mobile: true, email: true, status: true, isSuperAdmin: true, createdAt: true } as const;

/** List view: who the user is to each mandal — org-level role and per-festival assignments. */
const userListSelect = {
  ...userSelect,
  partner: { select: { id: true, name: true, status: true } },
  agent: { select: { id: true, name: true, code: true, status: true } },
  memberships: {
    select: { status: true, organization: { select: { id: true, name: true, city: true } }, role: { select: { key: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  assignments: {
    select: {
      status: true, role: { select: { key: true, name: true } },
      event: { select: { id: true, name: true, organization: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  },
} as const;

@SuperAdminOnly()
@Controller('users')
export class PlatformController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list(@Query() q: UserListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const inOrg = q.organizationId
      ? { OR: [{ memberships: { some: { organizationId: q.organizationId } } }, { assignments: { some: { event: { organizationId: q.organizationId } } } }] }
      : {};
    const kind: Prisma.UserWhereInput =
      q.kind === 'SUPER_ADMIN' ? { isSuperAdmin: true }
      : q.kind === 'MANDAL_MEMBER' ? { memberships: { some: { status: 'ACTIVE' } } }
      : q.kind === 'VOLUNTEER' ? { assignments: { some: { status: 'ACTIVE' } }, memberships: { none: { status: 'ACTIVE' } } }
      : q.kind === 'PARTNER' ? { partnerId: { not: null } }
      : q.kind === 'AGENT' ? { agentId: { not: null } }
      : q.kind === 'NO_ACCESS' ? { isSuperAdmin: false, partnerId: null, agentId: null, memberships: { none: { status: 'ACTIVE' } }, assignments: { none: { status: 'ACTIVE' } } }
      : {};
    const text = q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { mobile: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' as const } }] }
      : {};
    const where: Prisma.UserWhereInput = { AND: [text, inOrg, kind] };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userListSelect, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.user.count({ where }),
    ]);
    return paged(items, total, page, pageSize);
  }

  @Patch(':userId')
  async update(@CurrentUser() actor: RequestUser, @Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    if (userId === actor.id) throw new ForbiddenException({ statusCode: 403, message: 'You cannot change your own account here.', code: 'SELF_CHANGE' });
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
    return this.prisma.$transaction(async (tx) => {
      const after = await tx.user.update({
        where: { id: userId },
        data: {
          status: dto.status, isSuperAdmin: dto.isSuperAdmin,
          // Disabling or changing privilege level revokes outstanding sessions.
          tokenVersion: dto.status !== undefined || dto.isSuperAdmin !== undefined ? { increment: 1 } : undefined,
        },
        select: userSelect,
      });
      await this.audit.log({
        actorId: actor.id, action: 'user.updated', entityType: 'User', entityId: userId,
        before: { status: before.status, isSuperAdmin: before.isSuperAdmin }, after: { status: after.status, isSuperAdmin: after.isSuperAdmin },
        reason: dto.reason,
      }, tx);
      return after;
    });
  }
}
