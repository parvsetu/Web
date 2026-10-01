import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AgentEarningsService } from './agent-earnings.service';
import { CatalogAdminService } from './catalog-admin.service';
import { EventFeeService } from './event-fee.service';
import { EventReviewService } from './event-review.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

/** Mandal registration, per-event platform review, event registration fees and agent referral earnings. */
@Module({
  imports: [AuthModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, EventReviewService, EventFeeService, AgentEarningsService, CatalogAdminService],
  exports: [RegistrationsService, AgentEarningsService, EventFeeService],
})
export class RegistrationsModule {}
