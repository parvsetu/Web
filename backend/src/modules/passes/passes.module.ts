import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { PassOrdersAdminController, PublicBookingController } from './passes.controller';
import { PassesService } from './passes.service';
import { PassRefundsService } from './pass-refunds.service';
import { PASS_GATEWAYS, buildPassGateways } from './pass-gateways';

@Module({
  imports: [TokensModule, SponsorsModule],
  controllers: [PublicBookingController, PassOrdersAdminController],
  providers: [PassesService, PassRefundsService, { provide: PASS_GATEWAYS, useFactory: buildPassGateways }],
  exports: [PassesService, PassRefundsService],
})
export class PassesModule {}
