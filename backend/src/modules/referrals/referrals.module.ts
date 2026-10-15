import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BloggerGuard } from './blogger.guard';
import { BloggersService } from './bloggers.service';
import { ReferralEarningsService } from './referral-earnings.service';
import { ReferralsController } from './referrals.controller';

/**
 * Blogger / influencer referrals: signup, portal (/blogger/*), super-admin
 * review (/platform/bloggers, /platform/blogger-promotions) and the commission
 * ledger. Global so passes (credit on payment) and tokens (reverse on
 * cancellation) can call ReferralEarningsService inside their transactions.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ReferralsController],
  providers: [BloggersService, ReferralEarningsService, BloggerGuard],
  exports: [ReferralEarningsService],
})
export class ReferralsModule {}
