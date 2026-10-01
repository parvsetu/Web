import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Rate-limit per authenticated user (a gate full of volunteers shares one
 *  IP behind venue Wi-Fi/NAT); per IP only for anonymous routes. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.user?.id ? `u:${req.user.id}` : `ip:${req.ip}`;
  }
}
