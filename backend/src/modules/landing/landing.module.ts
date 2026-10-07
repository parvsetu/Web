import { Module } from '@nestjs/common';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { LandingController } from './landing.controller';
import { LandingService } from './landing.service';
import { AchievementsService } from './achievements.service';

@Module({ imports: [SponsorsModule, ReviewsModule], controllers: [LandingController], providers: [LandingService, AchievementsService], exports: [LandingService] })
export class LandingModule {}
