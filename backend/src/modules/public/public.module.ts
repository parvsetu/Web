import { Module } from '@nestjs/common';
import { SponsorsModule } from '../sponsors/sponsors.module';
import { PublicController } from './public.controller';

@Module({ imports: [SponsorsModule], controllers: [PublicController] })
export class PublicModule {}
