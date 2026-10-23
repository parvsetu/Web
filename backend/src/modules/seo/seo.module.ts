import { Module } from '@nestjs/common';
import { SeoAdminController, SeoPublicController } from './seo.controller';

@Module({ controllers: [SeoAdminController, SeoPublicController] })
export class SeoModule {}
