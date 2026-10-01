import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Access, CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { DonationsService } from './donations.service';
import { CreateDonationDto, DonationListQuery, UpdateDonationDto } from './donations.dto';

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
    return this.donations.list(a.event!, q);
  }

  @RequireEventPermission('DONATION_CREATE')
  @Post('events/:eventId/donations')
  create(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Body() dto: CreateDonationDto) {
    return this.donations.create(user, a.event!, dto, a.perms);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Get('events/:eventId/donations/:id')
  get(@Param('eventId') eventId: string, @Param('id') id: string) {
    return this.donations.get(eventId, id);
  }

  @RequireEventPermission('DONATION_UPDATE')
  @Patch('events/:eventId/donations/:id')
  update(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('id') id: string, @Body() dto: UpdateDonationDto) {
    return this.donations.update(user, a.event!, id, dto);
  }

  @RequireEventPermission('DONATION_VIEW')
  @Get('events/:eventId/donations/:id/receipt')
  receipt(@Param('eventId') eventId: string, @Param('id') id: string) {
    return this.donations.receipt(eventId, id);
  }
}
