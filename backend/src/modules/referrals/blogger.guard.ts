import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BloggerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/auth/request-user';

const BLOGGER_MODE = 'bloggerMode';

export interface BloggerCtx {
  id: string;
  name: string;
  status: BloggerStatus;
}

/**
 * /blogger/* routes: the caller must be a blogger account (User.bloggerId).
 *   read  — any blogger (REJECTED / SUSPENDED keep read access to their history)
 *   write — PENDING or ACTIVE (profile edits, requesting festivals to promote)
 * Codes only earn while the blogger is ACTIVE (ReferralEarningsService).
 * Org/event routes need no check: a blogger has no memberships (404 everywhere).
 */
export const BloggerRoute = (mode: 'read' | 'write' = 'read') => applyDecorators(SetMetadata(BLOGGER_MODE, mode), UseGuards(BloggerGuard));

export const CurrentBlogger = createParamDecorator((_d: unknown, ctx: ExecutionContext): BloggerCtx => ctx.switchToHttp().getRequest().blogger);

@Injectable()
export class BloggerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const mode = this.reflector.getAllAndOverride<'read' | 'write'>(BLOGGER_MODE, [context.getHandler(), context.getClass()]) ?? 'read';
    const user: RequestUser | undefined = req.user;
    const blogger = user?.bloggerId
      ? await this.prisma.blogger.findUnique({ where: { id: user.bloggerId }, select: { id: true, name: true, status: true } })
      : null;
    if (!blogger) throw new ForbiddenException({ statusCode: 403, message: 'This area is for blogger and influencer accounts.', code: 'NOT_A_BLOGGER' });
    if (mode === 'write' && blogger.status !== 'ACTIVE' && blogger.status !== 'PENDING') {
      throw new ForbiddenException({ statusCode: 403, code: 'BLOGGER_INACTIVE', message: `Your blogger account is ${blogger.status.toLowerCase()}. Contact the Parvsetu team.` });
    }
    req.blogger = blogger;
    return true;
  }
}
