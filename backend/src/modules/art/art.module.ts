import { Module } from '@nestjs/common';
import { ArtController } from './art.controller';
import { ArtService } from './art.service';

/** Festival art gallery: display-only and for-sale artworks, buyer enquiries. */
@Module({ controllers: [ArtController], providers: [ArtService] })
export class ArtModule {}
