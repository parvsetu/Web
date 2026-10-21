import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { DonationsController, PublicDonationsController } from './donations.controller';
import { PublicDonationsService } from './public-donations.service';
import { PASS_GATEWAYS, buildPassGateways } from '../passes/pass-gateways';
import { DonationsService } from './donations.service';
import { PAYMENT_PROVIDERS } from './payment-provider';
import { buildProviders } from './providers';

@Module({
  imports: [TokensModule, SponsorsModule],
  controllers: [DonationsController, PublicDonationsController],
  providers: [
    DonationsService, PublicDonationsService,
    { provide: PAYMENT_PROVIDERS, useFactory: buildProviders },
    // Public donations use the same online gateways as public pass sales.
    { provide: PASS_GATEWAYS, useFactory: buildPassGateways },
  ],
})
export class DonationsModule {}
