import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery } from '../../common/http';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { AdjustCreditDto, RechargeDto, RechargeResultDto } from '../billing/billing.dto';
import { toPaise } from '../billing/billing.service';
import { CurrentPartner, PartnerCtx, PartnerRoute } from './partner.guard';
import { PartnersService } from './partners.service';
import { PartnersAdminService } from './partners-admin.service';
import {
  AdminCampaignQuery, AdminPartnerQuery, CampaignListQuery, CampaignReviewDto, CreateCampaignDto, MandalBrowseQuery, PartnerSignupDto, PartnerStatusDto, UpdatePartnerDto,
} from './partners.dto';

@Controller()
export class PartnersController {
  constructor(private readonly partners: PartnersService, private readonly admin: PartnersAdminService) {}

  // ─── Public ────────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('partners/signup')
  signup(@Body() dto: PartnerSignupDto) {
    return this.partners.signup(dto);
  }

  @Public()
  @Get('public/partners/:id/logo')
  async logo(@Param('id') id: string, @Res() res: Response) {
    const { bytes, type } = await this.partners.logo(id);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(bytes);
  }

  // ─── Partner portal ────────────────────────────────────────────────

  @PartnerRoute()
  @Get('partner/me')
  overview(@CurrentPartner() p: PartnerCtx) {
    return this.partners.overview(p);
  }

  @PartnerRoute('write')
  @Patch('partner/me')
  updateProfile(@CurrentUser() user: RequestUser, @CurrentPartner() p: PartnerCtx, @Body() dto: UpdatePartnerDto) {
    return this.partners.updateProfile(user, p, dto);
  }

  @PartnerRoute()
  @Get('partner/mandals')
  mandals(@Query() q: MandalBrowseQuery) {
    return this.partners.mandals(q);
  }

  @PartnerRoute()
  @Get('partner/campaigns')
  campaigns(@CurrentPartner() p: PartnerCtx, @Query() q: CampaignListQuery) {
    return this.partners.campaigns(p, q);
  }

  @PartnerRoute('write')
  @Post('partner/campaigns')
  requestCampaign(@CurrentUser() user: RequestUser, @CurrentPartner() p: PartnerCtx, @Body() dto: CreateCampaignDto) {
    return this.partners.requestCampaign(user, p, dto);
  }

  @PartnerRoute('write')
  @Post('partner/campaigns/:id/cancel')
  @HttpCode(200)
  cancelCampaign(@CurrentUser() user: RequestUser, @CurrentPartner() p: PartnerCtx, @Param('id') id: string) {
    return this.partners.cancelCampaign(user, p, id);
  }

  @PartnerRoute()
  @Get('partner/wallet/transactions')
  transactions(@CurrentPartner() p: PartnerCtx, @Query() q: PageQuery) {
    return this.partners.transactions(p, q);
  }

  @PartnerRoute()
  @Get('partner/recharges')
  recharges(@CurrentPartner() p: PartnerCtx, @Query() q: PageQuery) {
    return this.partners.recharges(p, q);
  }

  @PartnerRoute('write')
  @Post('partner/recharges')
  startRecharge(@CurrentUser() user: RequestUser, @CurrentPartner() p: PartnerCtx, @Body() dto: RechargeDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Online recharge is not available yet. Contact the platform team to add wallet balance.', code: 'RECHARGE_UNAVAILABLE' });
    return this.partners.startRecharge(user, p, toPaise(dto.amount));
  }

  @PartnerRoute('write')
  @Post('partner/recharges/:id/demo-pay')
  @HttpCode(200)
  demoPay(@CurrentUser() user: RequestUser, @CurrentPartner() p: PartnerCtx, @Param('id') id: string, @Body() dto: RechargeResultDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Demo payments are off.', code: 'RECHARGE_UNAVAILABLE' });
    return this.partners.completeRecharge(user, p, id, dto.outcome);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/partners')
  list(@Query() q: AdminPartnerQuery) {
    return this.admin.list(q);
  }

  @SuperAdminOnly()
  @Post('platform/partners/:id/status')
  @HttpCode(200)
  setStatus(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: PartnerStatusDto) {
    return this.admin.setStatus(user.id, id, dto);
  }

  @SuperAdminOnly()
  @Post('platform/partners/:id/adjust')
  @HttpCode(200)
  adjust(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AdjustCreditDto) {
    return this.admin.adjust(user.id, id, toPaise(dto.amount), dto.reason);
  }

  @SuperAdminOnly()
  @Get('platform/partners/:id/transactions')
  partnerTransactions(@Param('id') id: string, @Query() q: PageQuery) {
    return this.admin.transactions(id, q);
  }

  @SuperAdminOnly()
  @Get('platform/partner-campaigns')
  allCampaigns(@Query() q: AdminCampaignQuery) {
    return this.admin.campaigns(q);
  }

  @SuperAdminOnly()
  @Post('platform/partner-campaigns/:id/review')
  @HttpCode(200)
  review(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: CampaignReviewDto) {
    return this.admin.review(user.id, id, dto);
  }
}
