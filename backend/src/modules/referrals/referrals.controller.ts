import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { BloggerCtx, BloggerRoute, CurrentBlogger } from './blogger.guard';
import { BloggersService } from './bloggers.service';
import {
  BloggerListQuery, BloggerPayoutDto, BloggerSignupDto, BloggerStatusDto, PageQuery, PromotionCommissionDto, PromotionListQuery, ReferralCodeQuery,
  ReferralReportQuery, RequestPromotionDto, ReverseEntryDto, ReviewPromotionDto, UpdateBloggerProfileDto,
} from './referrals.dto';

@Controller()
export class ReferralsController {
  constructor(private readonly bloggers: BloggersService) {}

  // ─── Public ────────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bloggers/signup')
  signup(@Body() dto: BloggerSignupDto) {
    return this.bloggers.signup(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/booking/events/:eventId/referral')
  checkCode(@Param('eventId') eventId: string, @Query() q: ReferralCodeQuery) {
    return this.bloggers.checkCode(eventId, q.code);
  }

  // ─── Blogger portal ────────────────────────────────────────────────

  @BloggerRoute()
  @Get('blogger/me')
  overview(@CurrentBlogger() b: BloggerCtx) {
    return this.bloggers.overview(b);
  }

  @BloggerRoute('write')
  @Patch('blogger/me')
  update(@CurrentUser() u: RequestUser, @CurrentBlogger() b: BloggerCtx, @Body() dto: UpdateBloggerProfileDto) {
    return this.bloggers.updateProfile(u, b, dto);
  }

  @BloggerRoute()
  @Get('blogger/promotions')
  promotions(@CurrentBlogger() b: BloggerCtx) {
    return this.bloggers.myPromotions(b);
  }

  @BloggerRoute('write')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('blogger/promotions')
  request(@CurrentUser() u: RequestUser, @CurrentBlogger() b: BloggerCtx, @Body() dto: RequestPromotionDto) {
    return this.bloggers.requestPromotion(u, b, dto.eventId);
  }

  @BloggerRoute()
  @Get('blogger/ledger')
  ledger(@CurrentBlogger() b: BloggerCtx, @Query() q: PageQuery) {
    return this.bloggers.ledger(b.id, q);
  }

  @BloggerRoute()
  @Get('blogger/payouts')
  payouts(@CurrentBlogger() b: BloggerCtx, @Query() q: PageQuery) {
    return this.bloggers.payouts(b.id, q);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/bloggers')
  list(@Query() q: BloggerListQuery) {
    return this.bloggers.list(q);
  }

  @SuperAdminOnly()
  @Get('platform/bloggers/:id')
  detail(@Param('id') id: string) {
    return this.bloggers.detail(id);
  }

  @SuperAdminOnly()
  @Patch('platform/bloggers/:id/status')
  setStatus(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: BloggerStatusDto) {
    return this.bloggers.setStatus(u, id, dto);
  }

  @SuperAdminOnly()
  @Get('platform/bloggers/:id/ledger')
  bloggerLedger(@Param('id') id: string, @Query() q: PageQuery) {
    return this.bloggers.ledger(id, q);
  }

  @SuperAdminOnly()
  @Get('platform/bloggers/:id/payouts')
  bloggerPayouts(@Param('id') id: string, @Query() q: PageQuery) {
    return this.bloggers.payouts(id, q);
  }

  @SuperAdminOnly()
  @Post('platform/bloggers/:id/payouts')
  @HttpCode(200)
  payout(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: BloggerPayoutDto) {
    return this.bloggers.payout(u, id, dto);
  }

  @SuperAdminOnly()
  @Get('platform/blogger-promotions')
  promotionQueue(@Query() q: PromotionListQuery) {
    return this.bloggers.promotions(q);
  }

  @SuperAdminOnly()
  @Post('platform/blogger-promotions/:id/review')
  @HttpCode(200)
  review(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: ReviewPromotionDto) {
    return this.bloggers.reviewPromotion(u, id, dto);
  }

  @SuperAdminOnly()
  @Patch('platform/blogger-promotions/:id/commission')
  commission(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PromotionCommissionDto) {
    return this.bloggers.setCommission(u, id, dto);
  }

  @SuperAdminOnly()
  @Post('platform/referral-ledger/:entryId/reverse')
  @HttpCode(200)
  reverse(@CurrentUser() u: RequestUser, @Param('entryId') entryId: string, @Body() dto: ReverseEntryDto) {
    return this.bloggers.reverseEntry(u, entryId, dto.reason);
  }

  @SuperAdminOnly()
  @Get('platform/referrals/report')
  async report(@Query() q: ReferralReportQuery, @Res() res: Response) {
    const data = await this.bloggers.report(q);
    if (q.format !== 'csv') return res.json(data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="blogger-referrals${q.from ? `-${q.from}` : ''}${q.to ? `-${q.to}` : ''}.csv"`);
    return res.send(this.bloggers.reportCsv(data));
  }
}
