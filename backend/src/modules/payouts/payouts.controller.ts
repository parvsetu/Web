import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { PayoutsService } from './payouts.service';
import { PayoutAccountDto, PayoutListQuery, RecordPayoutDto, ReviewPayoutDto, SettlementQuery } from './payouts.dto';

@Controller()
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  // ─── Mandal ────────────────────────────────────────────────────────
  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/payout-account')
  get(@Param('orgId') orgId: string) {
    return this.payouts.get(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/payout-account')
  submit(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: PayoutAccountDto) {
    return this.payouts.submit(user.id, orgId, dto);
  }

  @RequireOrgPermission('DONATION_VIEW')
  @Get('organizations/:orgId/settlements')
  settlements(@Param('orgId') orgId: string, @Query() q: SettlementQuery) {
    return this.payouts.settlements({ ...q, organizationId: orgId });
  }

  @RequireOrgPermission('DONATION_VIEW')
  @Get('organizations/:orgId/payouts')
  orgPayouts(@Param('orgId') orgId: string, @Query() q: SettlementQuery) {
    return this.payouts.payouts({ ...q, organizationId: orgId });
  }

  // ─── Super admin ───────────────────────────────────────────────────
  @SuperAdminOnly()
  @Get('platform/payout-accounts')
  list(@Query() q: PayoutListQuery) {
    return this.payouts.list(q);
  }

  @SuperAdminOnly()
  @Post('platform/payout-accounts/:orgId/review')
  @HttpCode(200)
  review(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: ReviewPayoutDto) {
    return this.payouts.review(user.id, orgId, dto);
  }

  @SuperAdminOnly()
  @Get('platform/payout-accounts/:orgId/proof')
  async proof(@Param('orgId') orgId: string, @Res() res: Response) {
    const p = await this.payouts.proof(orgId);
    res.setHeader('Content-Type', p.type);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(p.bytes);
  }

  @SuperAdminOnly()
  @Post('platform/payout-accounts/:orgId/reveal-bank')
  @HttpCode(200)
  reveal(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string) {
    return this.payouts.revealBank(user.id, orgId);
  }

  @SuperAdminOnly()
  @Get('platform/settlements')
  allSettlements(@Query() q: SettlementQuery) {
    return this.payouts.settlements(q);
  }

  @SuperAdminOnly()
  @Get('platform/payouts')
  allPayouts(@Query() q: SettlementQuery) {
    return this.payouts.payouts(q);
  }

  @SuperAdminOnly()
  @Post('platform/payouts')
  record(@CurrentUser() user: RequestUser, @Body() dto: RecordPayoutDto) {
    return this.payouts.recordPayout(user.id, dto.organizationId, dto.reference, dto.note);
  }
}
