import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { MAX_BANNER_BYTES, StoredImageLike, UploadedImageFile } from '../../common/images/image-info';
import { ArtImageQuery, CreateArtworkDto, CreateEnquiryDto, EnquiryListQuery, UpdateArtworkDto, UpdateEnquiryDto } from './art.dto';
import { ArtService } from './art.service';

/** Enquiries per minute per client (lifted in tests). */
const ENQUIRY_LIMIT = Number(process.env.ART_ENQUIRY_RATE_LIMIT_PER_MIN ?? 5);

function sendImage(res: Response, img: StoredImageLike, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}

@Controller()
export class ArtController {
  constructor(private readonly art: ArtService) {}

  @RequireEventPermission('GALLERY_VIEW')
  @Get('events/:eventId/artworks')
  list(@Param('eventId') eventId: string) {
    return this.art.list(eventId);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Post('events/:eventId/artworks')
  create(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Body() dto: CreateArtworkDto) {
    return this.art.create(u, eventId, dto);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Patch('events/:eventId/artworks/:id')
  update(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: UpdateArtworkDto) {
    return this.art.update(u, eventId, id, dto);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Delete('events/:eventId/artworks/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string) {
    await this.art.remove(u, eventId, id);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Put('events/:eventId/artworks/:id/image')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }], { limits: { fileSize: MAX_BANNER_BYTES, files: 2 } }))
  setImage(
    @CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string,
    @UploadedFiles() files: { file?: UploadedImageFile[]; thumb?: UploadedImageFile[] } = {},
  ) {
    return this.art.setImage(u, eventId, id, files?.file?.[0], files?.thumb?.[0]);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Delete('events/:eventId/artworks/:id/image')
  removeImage(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string) {
    return this.art.removeImage(u, eventId, id);
  }

  @RequireEventPermission('GALLERY_VIEW')
  @Get('events/:eventId/artworks/:id/image')
  async adminImage(@Param('eventId') eventId: string, @Param('id') id: string, @Query() q: ArtImageQuery, @Res() res: Response) {
    sendImage(res, await this.art.image({ id, eventId }, q.size), 'private, max-age=31536000, immutable');
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Get('events/:eventId/artwork-enquiries')
  enquiries(@Param('eventId') eventId: string, @Query() q: EnquiryListQuery) {
    return this.art.enquiries(eventId, q);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Patch('events/:eventId/artwork-enquiries/:id')
  updateEnquiry(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: UpdateEnquiryDto) {
    return this.art.updateEnquiry(u, eventId, id, dto);
  }

  // ─── Public ──────────────────────────────────────────────────────────

  @Public()
  @Get('public/events/:eventId/artworks')
  publicList(@Param('eventId') eventId: string) {
    return this.art.publicForEvent(eventId);
  }

  @Public()
  @Get('public/artworks/:id/image')
  async publicImage(@Param('id') id: string, @Query() q: ArtImageQuery, @Res() res: Response) {
    sendImage(res, await this.art.publicImage(id, q.size), 'public, max-age=86400');
  }

  @Public()
  @Throttle({ default: { limit: ENQUIRY_LIMIT, ttl: 60_000 } })
  @Post('public/artworks/:id/enquiries')
  enquire(@Param('id') id: string, @Body() dto: CreateEnquiryDto) {
    return this.art.enquire(id, dto);
  }
}
