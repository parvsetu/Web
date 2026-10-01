import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { RequestUser } from './request-user';
import type { AccessContext } from '../access/access.service';

export const IS_PUBLIC = 'isPublic';
/** Route needs no JWT (login, register, public listings, provider webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => ctx.switchToHttp().getRequest().user,
);

/** The AccessContext resolved by PermissionGuard for this request. */
export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessContext => ctx.switchToHttp().getRequest().access,
);
