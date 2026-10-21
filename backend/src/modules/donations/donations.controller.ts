import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Access, CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, RequireLiveEvent } from '../../common/access/permission.guard';
import { DonationsService } from './donations.service';
import { PublicDonationsService } from './public-donations.service';
import { CreateDonationDto, CreatePublicDonationDto, DemoPayDonationDto, DonationKeyQuery, DonationListQuery, UpdateDonationDto } from './donations.dto';

@Controller()
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  @Get('payments/providers')
  providers() {
    return this.donations.listProviders();
  }

  @Public()
  @Post('payments/webhooks/:provider')
  @HttpCode(200)
  webhook(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    return this.donations.webhook(provider, req.headers, req.rawBody);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Get('events/:eventId/donations')
  list(@Access() a: AccessContext, @Query() q: DonationListQuery) {
    return this.donations.list(a.event!, q, a.perms);
  }

  @RequireEventPermission('DONATION_CREATE')
  @RequireLiveEvent('record donations')
  @Post('events/:eventId/donations')
  create(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Body() dto: CreateDonationDto) {
    return this.donations.create(user, a.event!, dto, a.perms);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Get('events/:eventId/donations/:id')
  get(@Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string) {
    return this.donations.get(eventId, id, a.perms);
  }

  @RequireEventPermission('DONATION_UPDATE')
  @RequireLiveEvent('edit donations')
  @Patch('events/:eventId/donations/:id')
  update(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('id') id: string, @Body() dto: UpdateDonationDto) {
    return this.donations.update(user, a.event!, id, dto, a.perms);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Post('events/:eventId/donations/:id/share')
  @HttpCode(200)
  share(@Param('eventId') eventId: string, @Param('id') id: string) {
    return this.donations.share(eventId, id);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('events/:eventId/donations/:id/email-receipt')
  @HttpCode(200)
  email(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('id') id: string) {
    return this.donations.emailReceipt(user.id, a.event!, id);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/receipts/:id')
  publicReceipt(@Param('id') id: string, @Query('k') k: string) {
    return this.donations.publicReceipt(id, k);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Get('events/:eventId/donations/:id/receipt')
  receipt(@Param('eventId') eventId: string, @Param('id') id: string) {
    return this.donations.receipt(eventId, id);
  }
}

/** Donating on the public festival page — no login, rate limited per IP. */
@Public()
@Controller('public/donations')
export class PublicDonationsController {
  constructor(private readonly donations: PublicDonationsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('events/:eventId')
  event(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.donations.eventInfo(eventId);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreatePublicDonationDto) {
    return this.donations.create(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @Query() q: DonationKeyQuery) {
    return this.donations.get(id, q.k);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/demo-pay')
  @HttpCode(200)
  demoPay(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DemoPayDonationDto) {
    return this.donations.demoPay(id, dto.k, dto.outcome);
  }
}
