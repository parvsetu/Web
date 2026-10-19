import { Module } from '@nestjs/common';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { EventsModule } from '../events/events.module';
import { PublicController } from './public.controller';

@Module({ imports: [SponsorsModule, EventsModule], controllers: [PublicController] })
export class PublicModule {}
