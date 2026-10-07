import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Access, CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { StallsService } from './stalls.service';
import { VendorsService } from './vendors.service';
import { CurrentVendor, VendorCtx, VendorRoute } from './vendor.guard';
import {
  AdminVendorQuery, CreateStallBookingDto, CreateStallTypeDto, StallBookingListQuery, StallPayDto, StallSettingsDto, UpdateStallBookingDto,
  UpdateStallTypeDto, UpdateVendorDto, VendorBookingQuery, VendorFestivalQuery, VendorSignupDto, VendorStatusDto,
} from './stalls.dto';

/** Vendor accounts: signup (public) and everything under /vendor. */
@Controller()
export class VendorController {
  constructor(private readonly vendors: VendorsService, private readonly stalls: StallsService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('vendors/signup')
  signup(@Body() dto: VendorSignupDto) {
    return this.vendors.signup(dto);
  }

  @VendorRoute('read')
  @Get('vendor/profile')
  profile(@CurrentVendor() v: VendorCtx) {
    return this.vendors.profile(v);
  }

  @VendorRoute('write')
  @Patch('vendor/profile')
  updateProfile(@CurrentUser() u: RequestUser, @CurrentVendor() v: VendorCtx, @Body() dto: UpdateVendorDto) {
    return this.vendors.updateProfile(u, v, dto);
  }

  @VendorRoute('read')
  @Get('vendor/festivals')
  festivals(@Query() q: VendorFestivalQuery) {
    return this.stalls.festivals(q);
  }

  @VendorRoute('read')
  @Get('vendor/festivals/:eventId')
  festival(@Param('eventId') eventId: string) {
    return this.stalls.festival(eventId);
  }

  @VendorRoute('read')
  @Get('vendor/bookings')
  bookings(@CurrentVendor() v: VendorCtx, @Query() q: VendorBookingQuery) {
    return this.stalls.myBookings(v, q);
  }

  @VendorRoute('read')
  @Get('vendor/bookings/:id')
  booking(@CurrentVendor() v: VendorCtx, @Param('id') id: string) {
    return this.stalls.myBooking(v, id);
  }

  @VendorRoute('write')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('vendor/bookings')
  create(@CurrentUser() u: RequestUser, @CurrentVendor() v: VendorCtx, @Body() dto: CreateStallBookingDto) {
    return this.stalls.createBooking(u, v, dto);
  }

  @VendorRoute('write')
  @Post('vendor/bookings/:id/demo-pay')
  @HttpCode(200)
  pay(@CurrentUser() u: RequestUser, @CurrentVendor() v: VendorCtx, @Param('id') id: string, @Body() dto: StallPayDto) {
    return this.stalls.demoPay(u, v, id, dto.outcome);
  }
}

/** Festival page: what's open for vendors (counts only). */
@Public()
@Controller('public/events/:eventId/stalls')
export class PublicStallsController {
  constructor(private readonly stalls: StallsService) {}

  @Get()
  summary(@Param('eventId') eventId: string) {
    return this.stalls.publicSummary(eventId);
  }
}

/** Mandal: stall types, settings and bookings of one festival. */
@Controller('events/:eventId')
export class EventStallsController {
  constructor(private readonly stalls: StallsService) {}

  @RequireEventPermission('STALL_VIEW')
  @Get('stalls')
  overview(@Access() a: AccessContext, @Param('eventId') eventId: string) {
    return this.stalls.overview(a.organizationId, eventId);
  }

  @RequireEventPermission('STALL_MANAGE')
  @Patch('stalls')
  settings(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Body() dto: StallSettingsDto) {
    return this.stalls.updateSettings(u.id, a.organizationId, eventId, dto);
  }

  @RequireEventPermission('STALL_MANAGE')
  @Post('stall-types')
  createType(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Body() dto: CreateStallTypeDto) {
    return this.stalls.createType(u.id, a.organizationId, eventId, dto);
  }

  @RequireEventPermission('STALL_MANAGE')
  @Patch('stall-types/:id')
  updateType(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: UpdateStallTypeDto) {
    return this.stalls.updateType(u.id, a.organizationId, eventId, id, dto);
  }

  @RequireEventPermission('STALL_MANAGE')
  @Delete('stall-types/:id')
  deleteType(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string) {
    return this.stalls.deleteType(u.id, a.organizationId, eventId, id);
  }

  @RequireEventPermission('STALL_VIEW')
  @Get('stall-bookings')
  bookings(@Param('eventId') eventId: string, @Query() q: StallBookingListQuery) {
    return this.stalls.bookings(eventId, q);
  }

  @RequireEventPermission('STALL_MANAGE')
  @Patch('stall-bookings/:id')
  updateBooking(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: UpdateStallBookingDto) {
    return this.stalls.updateBooking(u.id, a.organizationId, eventId, id, dto);
  }
}

/** Super admin: vendor accounts. */
@SuperAdminOnly()
@Controller('platform/vendors')
export class PlatformVendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(@Query() q: AdminVendorQuery) {
    return this.vendors.list(q);
  }

  @Post(':id/status')
  @HttpCode(200)
  status(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: VendorStatusDto) {
    return this.vendors.setStatus(u.id, id, dto.status, dto.note);
  }
}
