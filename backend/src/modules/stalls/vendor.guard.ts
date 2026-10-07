import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VendorStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/auth/request-user';

const VENDOR_MODE = 'vendorMode';

export interface VendorCtx {
  id: string;
  businessName: string;
  status: VendorStatus;
}

/**
 * /vendor/* routes: the caller must be a stall-vendor account.
 *   read  — any vendor (a SUSPENDED one keeps read access to its bookings)
 *   write — ACTIVE only (profile changes, new bookings, payments)
 * Org/event routes need no check: a vendor has no memberships, so
 * AccessService already answers 404 for every mandal.
 */
export const VendorRoute = (mode: 'read' | 'write' = 'read') => applyDecorators(SetMetadata(VENDOR_MODE, mode), UseGuards(VendorGuard));

export const CurrentVendor = createParamDecorator((_d: unknown, ctx: ExecutionContext): VendorCtx => ctx.switchToHttp().getRequest().vendor);

@Injectable()
export class VendorGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const mode = this.reflector.getAllAndOverride<'read' | 'write'>(VENDOR_MODE, [context.getHandler(), context.getClass()]) ?? 'read';
    const user: RequestUser | undefined = req.user;
    const vendor = user?.vendorId
      ? await this.prisma.vendor.findUnique({ where: { id: user.vendorId }, select: { id: true, businessName: true, status: true } })
      : null;
    if (!vendor) throw new ForbiddenException({ statusCode: 403, message: 'This area is for stall vendor accounts.', code: 'NOT_A_VENDOR' });
    if (mode === 'write' && vendor.status !== 'ACTIVE') {
      throw new ForbiddenException({ statusCode: 403, code: 'VENDOR_SUSPENDED', message: 'Your vendor account is suspended. Contact the platform team.' });
    }
    req.vendor = vendor;
    return true;
  }
}
