import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireEventPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { rupees } from '../billing/billing.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogAdminService } from './catalog-admin.service';
import { EventFeeService } from './event-fee.service';
import { EventReviewService } from './event-review.service';
import { RegistrationsService, RequestMeta } from './registrations.service';
import {
  ApproveEventDto, ApproveRegistrationDto, EventFeeRateDto, EventReviewQuery, FeeDemoPayDto, FeeQuoteQuery, MarkPaidDto, MyRegistrationDto, NoteDto,
  ReasonDto, RegistrationListQuery, SelfRegistrationDto, SetPasswordDto, SubmitEventDto, UpdateCustomTypeDto, UpdateRegistrationDto,
} from './registrations.dto';

export function meta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

/** Self-registrations per IP per minute (tests raise it; see test/setup-env.ts). */
export const REGISTER_RATE_LIMIT = Number(process.env.REGISTER_RATE_LIMIT_PER_MIN ?? 10);

@Controller()
export class RegistrationsController {
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly review: EventReviewService,
    private readonly fees: EventFeeService,
    private readonly catalogAdmin: CatalogAdminService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Public ────────────────────────────────────────────────────────

  @Public()
  @Throttle({ default: { limit: REGISTER_RATE_LIMIT, ttl: 60_000 } })
  @Post('public/mandal-registrations')
  selfRegister(@Body() dto: SelfRegistrationDto, @Req() req: Request) {
    return this.registrations.createSelf(dto, meta(req));
  }

  /** Prefilled ?ref= codes: says whose code it is (first name only). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/referral/:code')
  async referral(@Param('code') code: string) {
    const a = await this.prisma.agent.findUnique({ where: { code: code.trim().toUpperCase() }, select: { name: true, status: true, code: true } });
    return a && a.status === 'ACTIVE' ? { valid: true, code: a.code, agentName: a.name.split(/\s+/)[0] } : { valid: false };
  }

  @Public()
  @Get('public/event-fee-quote')
  async quote(@Query() q: FeeQuoteQuery) {
    const r = await this.fees.quote(this.prisma, null, q.festivalType);
    return { fee: rupees(r.feePaise), source: r.source };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/event-fee/:token')
  feeLink(@Param('token') token: string) {
    return this.fees.publicView(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('public/event-fee/:token/demo-pay')
  @HttpCode(200)
  feeDemoPay(@Param('token') token: string, @Body() dto: FeeDemoPayDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, code: 'PAYMENTS_UNAVAILABLE', message: 'Online payment is not available yet. Contact the Parvsetu team to pay by bank transfer.' });
    return this.fees.demoPay(token, dto.outcome);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/set-password')
  @HttpCode(200)
  setPassword(@Body() dto: SetPasswordDto) {
    return this.registrations.setPassword(dto.token, dto.password);
  }

  // ─── Applicant ─────────────────────────────────────────────────────

  @Get('me/mandal-registrations')
  mine(@CurrentUser() user: RequestUser) {
    return this.registrations.mine(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('me/mandal-registrations')
  createMine(@CurrentUser() user: RequestUser, @Body() dto: MyRegistrationDto, @Req() req: Request) {
    return this.registrations.createForUser(user, dto, meta(req));
  }

  @Patch('me/mandal-registrations/:id')
  updateMine(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateRegistrationDto, @Req() req: Request) {
    return this.registrations.updateMine(user, id, dto, meta(req));
  }

  // ─── Mandal: per-event review ──────────────────────────────────────

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/approval')
  approval(@Param('eventId') eventId: string) {
    return this.review.approval(eventId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Post('events/:eventId/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: SubmitEventDto, @Req() req: Request) {
    return this.review.submit(user, eventId, dto.declarationAccepted, meta(req));
  }

  // ─── Super admin: registrations ────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/mandal-registrations')
  list(@Query() q: RegistrationListQuery) {
    return this.registrations.list(q);
  }

  @SuperAdminOnly()
  @Get('platform/mandal-registrations/:id')
  get(@Param('id') id: string) {
    return this.registrations.get(id);
  }

  @SuperAdminOnly()
  @Post('platform/mandal-registrations/:id/approve')
  @HttpCode(200)
  approveRegistration(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ApproveRegistrationDto) {
    return this.registrations.approve(user.id, id, dto);
  }

  @SuperAdminOnly()
  @Post('platform/mandal-registrations/:id/request-changes')
  @HttpCode(200)
  registrationChanges(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.registrations.requestChanges(user.id, id, dto.note);
  }

  @SuperAdminOnly()
  @Post('platform/mandal-registrations/:id/reject')
  @HttpCode(200)
  rejectRegistration(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.registrations.reject(user.id, id, dto.reason);
  }

  // ─── Super admin: event reviews & fees ─────────────────────────────

  @SuperAdminOnly()
  @Get('platform/event-reviews')
  reviews(@Query() q: EventReviewQuery) {
    return this.review.list(q);
  }

  @SuperAdminOnly()
  @Get('platform/events/:eventId/review')
  reviewOne(@Param('eventId') eventId: string) {
    return this.review.one(eventId);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/approve')
  @HttpCode(200)
  approveEvent(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: ApproveEventDto) {
    return this.review.approve(user.id, eventId, dto);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/request-changes')
  @HttpCode(200)
  eventChanges(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: NoteDto) {
    return this.review.requestChanges(user.id, eventId, dto.note);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/reject')
  @HttpCode(200)
  rejectEvent(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: ReasonDto) {
    return this.review.reject(user.id, eventId, dto.reason);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/unpublish')
  @HttpCode(200)
  unpublish(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: ReasonDto) {
    return this.review.unpublish(user.id, eventId, dto.reason);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/fee/link')
  @HttpCode(200)
  newLink(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string) {
    return this.fees.regenerate(user.id, eventId);
  }

  @SuperAdminOnly()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('platform/events/:eventId/fee/email')
  @HttpCode(200)
  emailLink(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string) {
    return this.fees.emailLink(user.id, eventId);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/fee/mark-paid')
  @HttpCode(200)
  markPaid(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: MarkPaidDto) {
    return this.fees.markPaid(user.id, eventId, dto);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/fee/waive')
  @HttpCode(200)
  waive(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: ReasonDto) {
    return this.fees.waive(user.id, eventId, dto.reason);
  }

  @SuperAdminOnly()
  @Post('platform/events/:eventId/fee/refund')
  @HttpCode(200)
  refund(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: ReasonDto) {
    return this.fees.refund(user.id, eventId, dto.reason);
  }

  // ─── Super admin: fee rates & custom festival types ────────────────

  @SuperAdminOnly()
  @Get('platform/event-fee-rates')
  feeRates() {
    return this.catalogAdmin.feeRates();
  }

  @SuperAdminOnly()
  @Put('platform/event-fee-rates')
  setFeeRate(@CurrentUser() user: RequestUser, @Body() dto: EventFeeRateDto) {
    return this.catalogAdmin.setFeeRate(user.id, dto);
  }

  @SuperAdminOnly()
  @Get('platform/custom-festival-types')
  customTypes() {
    return this.catalogAdmin.customTypes();
  }

  @SuperAdminOnly()
  @Patch('platform/custom-festival-types/:key')
  updateCustomType(@CurrentUser() user: RequestUser, @Param('key') key: string, @Body() dto: UpdateCustomTypeDto) {
    return this.catalogAdmin.updateCustomType(user.id, key, dto);
  }
}
