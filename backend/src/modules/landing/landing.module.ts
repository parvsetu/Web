import { Module } from '@nestjs/common';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';

@Module({ imports: [SponsorsModule], controllers: [LandingController], providers: [LandingService], exports: [LandingService] })
export class LandingModule {}
