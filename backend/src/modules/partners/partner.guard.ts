import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PartnerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/auth/request-user';

const PARTNER_MODE = 'partnerMode';

export interface PartnerCtx {
  id: string;
  name: string;
  status: PartnerStatus;
}

/**
 * /partner/* routes: the caller must be a promotional-partner account.
 *   read  — any partner (SUSPENDED / REJECTED keep read-only access to their history)
 *   write — PENDING or ACTIVE only (a PENDING brand can fill its profile, recharge and
 *           request campaigns; nothing prints until the super admin activates it)
 * Org/event routes never need a check here: a partner has no memberships, so
 * AccessService already answers 404 for every mandal.
 */
export const PartnerRoute = (mode: 'read' | 'write' = 'read') => applyDecorators(SetMetadata(PARTNER_MODE, mode), UseGuards(PartnerGuard));

export const CurrentPartner = createParamDecorator((_d: unknown, ctx: ExecutionContext): PartnerCtx => ctx.switchToHttp().getRequest().partner);

@Injectable()
export class PartnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const mode = this.reflector.getAllAndOverride<'read' | 'write'>(PARTNER_MODE, [context.getHandler(), context.getClass()]) ?? 'read';
    const user: RequestUser | undefined = req.user;
    const partner = user?.partnerId
      ? await this.prisma.partner.findUnique({ where: { id: user.partnerId }, select: { id: true, name: true, status: true } })
      : null;
    if (!partner) throw new ForbiddenException({ statusCode: 403, message: 'This area is for promotional partner accounts.', code: 'NOT_A_PARTNER' });
    if (mode === 'write' && (partner.status === 'SUSPENDED' || partner.status === 'REJECTED')) {
      throw new ForbiddenException({
        statusCode: 403, code: 'PARTNER_LOCKED',
        message: partner.status === 'SUSPENDED' ? 'Your partner account is suspended. Contact the platform team.' : 'Your partner application was not approved.',
      });
    }
    req.partner = partner;
    return true;
  }
}
