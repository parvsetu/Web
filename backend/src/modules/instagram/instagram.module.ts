import { Module } from '@nestjs/common';
import { InstagramController } from './instagram.controller';
import { INSTAGRAM_PROVIDER, buildInstagramProvider } from './instagram-provider';
import { InstagramService } from './instagram.service';

/** Instagram photo import for landing pages (provider: real Meta API, the simulated one in dev/tests, or none). */
@Module({
  controllers: [InstagramController],
  providers: [InstagramService, { provide: INSTAGRAM_PROVIDER, useFactory: buildInstagramProvider }],
  exports: [InstagramService],
})
export class InstagramModule {}
