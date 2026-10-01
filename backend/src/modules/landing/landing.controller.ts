import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { LandingService } from './landing.service';
import { GrantLandingDto, LandingPayResultDto, RevokeLandingDto, UpdateLandingPageDto } from './landing.dto';

@Controller()
export class LandingController {
  constructor(private readonly landing: LandingService, private readonly prisma: PrismaService) {}

  // ─── Mandal ──────────────────────────────────────────────────────────

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/landing-page')
  status(@Param('orgId') orgId: string) {
    return this.landing.status(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/landing-page')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: UpdateLandingPageDto) {
    return this.landing.update(user.id, orgId, dto);
  }

  /** The page as visitors will see it, even before it is paid (for the editor's preview). */
  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/landing-page/preview')
  async preview(@Param('orgId') orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
    return this.landing.publicPage(org.slug, true);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/landing-page/purchases')
  start(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Online payment is not available yet. Contact the platform admin to activate your landing page.', code: 'PAYMENT_UNAVAILABLE' });
    return this.landing.startPurchase(user.id, orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/landing-page/purchases/:id/demo-pay')
  @HttpCode(200)
  demoPay(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: LandingPayResultDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Demo payments are off.', code: 'PAYMENT_UNAVAILABLE' });
    return this.landing.completePurchase(user.id, orgId, id, dto.outcome);
  }

  // ─── Super admin ─────────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/landing-pages/:orgId')
  adminStatus(@Param('orgId') orgId: string) {
    return this.landing.status(orgId);
  }

  @SuperAdminOnly()
  @Post('platform/landing-pages/:orgId/grant')
  @HttpCode(200)
  grant(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: GrantLandingDto) {
    return this.landing.grant(user.id, orgId, dto);
  }

  @SuperAdminOnly()
  @Post('platform/landing-pages/:orgId/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: RevokeLandingDto) {
    return this.landing.revoke(user.id, orgId, dto.reason);
  }

  @SuperAdminOnly()
  @Get('platform/landing-purchases')
  purchases(@Query() q: PageQuery) {
    return this.landing.purchases(q);
  }

  // ─── Public ──────────────────────────────────────────────────────────

  @Public()
  @Get('public/landing/:slug')
  page(@Param('slug') slug: string) {
    return this.landing.publicPage(slug);
  }
}
