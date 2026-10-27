import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { PassesService } from './passes.service';
import { PassRefundsService } from './pass-refunds.service';
import { AvailabilityQuery, BookableEventsQuery, CancelPassOrderDto, CreatePassOrderDto, DemoPayDto, MarkRefundedDto, OrderKeyQuery, PassOrderListQuery } from './passes.dto';

/** Visitor-facing booking API — no login. Rate limited per IP. */
@Public()
@Controller('public/booking')
export class PublicBookingController {
  constructor(private readonly passes: PassesService) {}

  @Get('events')
  events(@Query() q: BookableEventsQuery) {
    return this.passes.bookableEvents(q);
  }

  @Get('events/:eventId')
  event(@Param('eventId') eventId: string) {
    return this.passes.eventForBooking(eventId);
  }

  @Get('events/:eventId/availability')
  availability(@Param('eventId') eventId: string, @Query() q: AvailabilityQuery) {
    return this.passes.availability(eventId, q.date);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders')
  create(@Body() dto: CreatePassOrderDto) {
    return this.passes.createOrder(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('orders/:orderId')
  get(@Param('orderId') orderId: string, @Query() q: OrderKeyQuery) {
    return this.passes.getOrder(orderId, q.k);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders/:orderId/demo-pay')
  @HttpCode(200)
  demoPay(@Param('orderId') orderId: string, @Body() dto: DemoPayDto) {
    return this.passes.demoPay(orderId, dto.k, dto.outcome);
  }
}

@Controller('events/:eventId/pass-orders')
export class PassOrdersAdminController {
  constructor(private readonly passes: PassesService, private readonly refunds: PassRefundsService) {}

  @RequireEventPermission('DONATION_VIEW')
  @Get()
  list(@Param('eventId') eventId: string, @Query() q: PassOrderListQuery) {
    return this.passes.listForEvent(eventId, q);
  }

  /** Cancels a paid booking and refunds the buyer (money handling: DONATION_UPDATE, like the Treasurer). */
  @RequireEventPermission('DONATION_UPDATE')
  @Post(':orderId/cancel')
  @HttpCode(200)
  async cancel(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('orderId') orderId: string, @Body() dto: CancelPassOrderDto) {
    await this.refunds.cancelOrder(user.id, eventId, orderId, dto);
    return this.passes.adminOrder(eventId, orderId);
  }

  /** The refund was sent outside Parvsetu (UPI / bank): record its reference. */
  @RequireEventPermission('DONATION_UPDATE')
  @Post(':orderId/refund-sent')
  @HttpCode(200)
  async refundSent(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('orderId') orderId: string, @Body() dto: MarkRefundedDto) {
    await this.refunds.markRefunded(user.id, eventId, orderId, dto.refundReference);
    return this.passes.adminOrder(eventId, orderId);
  }
}
