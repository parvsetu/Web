import { Body, Controller, ForbiddenException, Get, Param, Patch, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery, paged, paging } from '../../common/http';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

class UserListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

class UpdateUserDto {
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED';
  @IsOptional() @IsBoolean() isSuperAdmin?: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

const userSelect = { id: true, name: true, mobile: true, email: true, status: true, isSuperAdmin: true, createdAt: true } as const;

@SuperAdminOnly()
@Controller('users')
export class PlatformController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list(@Query() q: UserListQuery) {
    const { page, pageSize, skip, take } = paging(q);
    const where = q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { mobile: { contains: q.q } }, { email: { contains: q.q, mode: 'insensitive' as const } }] }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({ where, select: userSelect, orderBy: { createdAt: 'desc' }, skip, take }),
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
