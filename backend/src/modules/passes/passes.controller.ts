import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/auth/decorators';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { PassesService } from './passes.service';
import { AvailabilityQuery, BookableEventsQuery, CreatePassOrderDto, DemoPayDto, OrderKeyQuery, PassOrderListQuery } from './passes.dto';

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
  constructor(private readonly passes: PassesService) {}

  @RequireEventPermission('DONATION_VIEW')
  @Get()
  list(@Param('eventId') eventId: string, @Query() q: PassOrderListQuery) {
    return this.passes.listForEvent(eventId, q);
  }
}
