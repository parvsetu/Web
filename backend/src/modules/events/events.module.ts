import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PriceRulesService } from './price-rules.service';
import { EventSlugService } from './event-slug.service';

@Module({
  imports: [OrganizationsModule],
  controllers: [EventsController],
  providers: [EventsService, PriceRulesService, EventSlugService],
  exports: [EventsService, EventSlugService],
})
export class EventsModule {}
