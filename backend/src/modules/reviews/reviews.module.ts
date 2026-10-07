import { Module } from '@nestjs/common';
import { EventReviewsController, OrgReviewsController, PlatformReviewsController, PublicReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [PublicReviewsController, OrgReviewsController, EventReviewsController, PlatformReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
