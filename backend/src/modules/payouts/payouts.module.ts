import { Global, Module } from '@nestjs/common';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';

@Global()
@Module({ controllers: [PayoutsController], providers: [PayoutsService], exports: [PayoutsService] })
export class PayoutsModule {}
