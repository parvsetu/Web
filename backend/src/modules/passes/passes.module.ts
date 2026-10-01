import { Module } from '@nestjs/common';
import { TokensModule } from '../tokens/tokens.module';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { PassOrdersAdminController, PublicBookingController } from './passes.controller';
import { PassesService } from './passes.service';
import { PASS_GATEWAYS, buildPassGateways } from './pass-gateways';

@Module({
  imports: [TokensModule, SponsorsModule],
  controllers: [PublicBookingController, PassOrdersAdminController],
  providers: [PassesService, { provide: PASS_GATEWAYS, useFactory: buildPassGateways }],
})
export class PassesModule {}
