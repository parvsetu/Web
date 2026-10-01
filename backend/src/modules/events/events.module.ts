import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PriceRulesService } from './price-rules.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [EventsController],
  providers: [EventsService, PriceRulesService],
  exports: [EventsService],
})
export class EventsModule {}
