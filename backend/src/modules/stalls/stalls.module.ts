import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PASS_GATEWAYS, buildPassGateways } from '../passes/pass-gateways';
import { EventStallsController, PlatformVendorsController, PublicStallsController, VendorController } from './stalls.controller';
import { StallsService } from './stalls.service';
import { VendorsService } from './vendors.service';
import { VendorGuard } from './vendor.guard';

/** Stall booking + vendor accounts. Payments use the same gateways as online passes. */
@Module({
  imports: [AuthModule],
  controllers: [VendorController, PublicStallsController, EventStallsController, PlatformVendorsController],
  providers: [StallsService, VendorsService, VendorGuard, { provide: PASS_GATEWAYS, useFactory: buildPassGateways }],
})
export class StallsModule {}
