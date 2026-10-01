import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireAnyEventPermission, RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { Access } from '../../common/auth/decorators';
import { AccessContext } from '../../common/access/access.service';
import { BillingService, toPaise } from './billing.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { AdjustCreditDto, CreditTxQuery, MandalBillingQuery, MandalPricingDto, PlatformSettingsDto, RechargeDto, RechargeResultDto } from './billing.dto';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ─── Super admin ───────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/billing/settings')
  async settings() {
    return this.billing.presentSettings(await this.billing.settings());
  }

  @SuperAdminOnly()
  @Put('platform/billing/settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: PlatformSettingsDto) {
    return this.billing.updateSettings(user.id, dto);
  }

  @SuperAdminOnly()
  @Get('platform/billing/summary')
  summary() {
    return this.billing.summary();
  }

  @SuperAdminOnly()
  @Get('platform/billing/mandals')
  mandals(@Query() q: MandalBillingQuery) {
    return this.billing.mandals(q);
  }

  @SuperAdminOnly()
  @Patch('platform/billing/mandals/:orgId')
  updateMandal(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: MandalPricingDto) {
    return this.billing.updateMandal(user.id, orgId, dto);
  }

  @SuperAdminOnly()
  @Post('platform/billing/mandals/:orgId/adjust')
  @HttpCode(200)
  adjust(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: AdjustCreditDto) {
    return this.billing.adjust(user.id, orgId, toPaise(dto.amount), dto.reason);
  }

  @SuperAdminOnly()
  @Get('platform/billing/transactions')
  allTransactions(@Query() q: CreditTxQuery) {
    return this.billing.transactions(q);
  }

  // ─── Mandal ────────────────────────────────────────────────────────

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/billing')
  status(@Param('orgId') orgId: string) {
    return this.billing.status(orgId);
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/billing/transactions')
  transactions(@Param('orgId') orgId: string, @Query() q: CreditTxQuery) {
    return this.billing.transactions({ ...q, organizationId: orgId });
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/billing/recharges')
  recharges(@Param('orgId') orgId: string, @Query() q: CreditTxQuery) {
    return this.billing.recharges(orgId, q);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/billing/recharges')
  startRecharge(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: RechargeDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Online recharge is not available yet. Contact the platform admin to add credit.', code: 'RECHARGE_UNAVAILABLE' });
    return this.billing.startRecharge(user.id, orgId, toPaise(dto.amount));
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/billing/recharges/:id/demo-pay')
  @HttpCode(200)
  demoPay(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: RechargeResultDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Demo payments are off.', code: 'RECHARGE_UNAVAILABLE' });
    return this.billing.completeRecharge(user.id, orgId, id, dto.outcome);
  }

  /** For the token desk: can passes be generated right now? */
  @RequireAnyEventPermission('TOKEN_CREATE', 'TOKEN_GENERATE', 'DONATION_CREATE')
  @Get('events/:eventId/credit-status')
  async eventCredit(@Access() a: AccessContext) {
    const s = await this.billing.status(a.organizationId);
    return { state: s.state, message: s.message, tokensLeft: s.tokensLeft, feePerPass: s.feePerPass, balance: s.balance };
  }
}
