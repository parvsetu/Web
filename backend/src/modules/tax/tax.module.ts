import { Global, Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

/** 80G donation tax: mandal profile, per-donation eligibility, receipt versions, Form 10BD / 10BE. Global so donations can sync inside their transactions. */
@Global()
@Module({ controllers: [TaxController], providers: [TaxService], exports: [TaxService] })
export class TaxModule {}
