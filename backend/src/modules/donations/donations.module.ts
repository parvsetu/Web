import { Module } from '@nestjs/common';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { PAYMENT_PROVIDERS } from './payment-provider';
import { buildProviders } from './providers';

@Module({
  controllers: [DonationsController],
  providers: [DonationsService, { provide: PAYMENT_PROVIDERS, useFactory: buildProviders }],
})
export class DonationsModule {}
