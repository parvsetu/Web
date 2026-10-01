import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { PAYMENT_PROVIDERS } from './payment-provider';
import { buildProviders } from './providers';

@Module({
  imports: [TokensModule],
  controllers: [DonationsController],
  providers: [DonationsService, { provide: PAYMENT_PROVIDERS, useFactory: buildProviders }],
})
export class DonationsModule {}
