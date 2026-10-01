import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';
import { PartnersAdminService } from './partners-admin.service';
import { PartnerGuard } from './partner.guard';

/** Promotional partners (brands). PartnerBillingService lives in the global BillingModule. */
@Module({
  imports: [AuthModule],
  controllers: [PartnersController],
  providers: [PartnersService, PartnersAdminService, PartnerGuard],
})
export class PartnersModule {}
