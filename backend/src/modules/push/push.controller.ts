import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { PushService } from './push.service';
import { EndpointDto, PassPushDto, PushSubscriptionDto } from './push.dto';

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  /** The application server key browsers need to subscribe. */
  @Public()
  @Get('public/push/key')
  key() {
    return this.push.publicKey();
  }

  /** Visitor: remind this phone about a pass (order id + its access key, like the pass page). */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public/booking/orders/:orderId/push')
  @HttpCode(200)
  subscribeOrder(@Param('orderId') orderId: string, @Body() dto: PassPushDto, @Headers('user-agent') ua?: string) {
    return this.push.subscribeOrder(orderId, dto.k, dto.subscription, ua);
  }

  /** Turn off notifications on this phone. */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('public/push/unsubscribe')
  @HttpCode(200)
  unsubscribe(@Body() dto: EndpointDto) {
    return this.push.unsubscribe(dto.endpoint);
  }

  /** Signed-in: send my notifications to this phone. */
  @Post('push/subscriptions')
  @HttpCode(200)
  subscribe(@CurrentUser() u: RequestUser, @Body() dto: PushSubscriptionDto, @Headers('user-agent') ua?: string) {
    return this.push.subscribeUser(u.id, dto, ua);
  }

  @Get('push/subscriptions/status')
  status(@CurrentUser() u: RequestUser, @Query() q: EndpointDto) {
    return this.push.status(q.endpoint, u.id);
  }
}
