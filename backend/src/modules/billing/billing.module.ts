import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PartnerBillingService } from '../partners/partner-billing.service';

@Global()
@Module({ controllers: [BillingController], providers: [BillingService, PartnerBillingService], exports: [BillingService, PartnerBillingService] })
export class BillingModule {}
