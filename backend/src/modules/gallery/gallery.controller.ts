import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFile, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Access, CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, RequireOrgPermission } from '../../common/access/permission.guard';
import {
  MAX_BANNER_BYTES, MAX_LOGO_BYTES, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, StoredImageLike, UploadedImageFile,
} from '../../common/images/image-info';
import { GalleryService } from './gallery.service';
import { OrgPhotoListQuery, PhotoImageQuery, PhotoListQuery, UpdatePhotoDto, UploadPhotosDto } from './gallery.dto';

function sendImage(res: Response, img: StoredImageLike, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}

/** Logo/banner URLs carry ?v=<updatedAt>, so the bytes behind one URL never change. */
const PUBLIC_IMMUTABLE = 'public, max-age=31536000, immutable';
/** A public photo can be made private again, so its public copy is cached for a day only. */
const PUBLIC_DAY = 'public, max-age=86400';
/** Private photo bytes never change for an id; only the authorised browser caches them. */
const PRIVATE_LONG = 'private, max-age=31536000, immutable';

@Controller()
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  // ─── Mandal logo & banner ────────────────────────────────────────────

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }))
  setLogo(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @UploadedFile() file: UploadedImageFile) {
    return this.gallery.setOrgImage(user, orgId, 'logo', file);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/banner')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BANNER_BYTES, files: 1 } }))
  setBanner(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @UploadedFile() file: UploadedImageFile) {
    return this.gallery.setOrgImage(user, orgId, 'banner', file);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Delete('organizations/:orgId/logo')
  removeLogo(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string) {
    return this.gallery.removeOrgImage(user, orgId, 'logo');
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Delete('organizations/:orgId/banner')
  removeBanner(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string) {
    return this.gallery.removeOrgImage(user, orgId, 'banner');
  }

  @Public()
  @Get('public/organizations/:orgId/logo')
  async logo(@Param('orgId') orgId: string, @Res() res: Response) {
    sendImage(res, await this.gallery.orgImage(orgId, 'logo'), PUBLIC_IMMUTABLE);
  }

  @Public()
  @Get('public/organizations/:orgId/banner')
  async banner(@Param('orgId') orgId: string, @Res() res: Response) {
    sendImage(res, await this.gallery.orgImage(orgId, 'banner'), PUBLIC_IMMUTABLE);
  }

  // ─── Festival photos ─────────────────────────────────────────────────

  @RequireEventPermission('GALLERY_VIEW')
  @Get('events/:eventId/photos')
  list(@Param('eventId') eventId: string, @Query() q: PhotoListQuery) {
    return this.gallery.list(eventId, q);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Post('events/:eventId/photos')
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'files', maxCount: MAX_PHOTOS_PER_UPLOAD }, { name: 'thumbs', maxCount: MAX_PHOTOS_PER_UPLOAD }],
    { limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_UPLOAD * 2, fields: 5 } },
  ))
  upload(
    @CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string,
    @UploadedFiles() files: { files?: UploadedImageFile[]; thumbs?: UploadedImageFile[] } = {}, @Body() dto: UploadPhotosDto,
  ) {
    return this.gallery.upload(user, a.organizationId, eventId, files?.files ?? [], files?.thumbs ?? [], dto.meta);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Patch('events/:eventId/photos/:photoId')
  update(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('photoId') photoId: string, @Body() dto: UpdatePhotoDto) {
    return this.gallery.update(user, eventId, photoId, dto);
  }

  @RequireEventPermission('GALLERY_MANAGE')
  @Delete('events/:eventId/photos/:photoId')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('photoId') photoId: string) {
    await this.gallery.remove(user, eventId, photoId);
  }

  @RequireEventPermission('GALLERY_VIEW')
  @Get('events/:eventId/photos/:photoId/image')
  async image(@Param('eventId') eventId: string, @Param('photoId') photoId: string, @Query() q: PhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.gallery.image(eventId, photoId, q.size), PRIVATE_LONG);
  }

  @RequireOrgPermission('GALLERY_VIEW')
  @Get('organizations/:orgId/photos/summary')
  orgSummary(@Param('orgId') orgId: string) {
    return this.gallery.orgSummary(orgId);
  }

  @RequireOrgPermission('GALLERY_VIEW')
  @Get('organizations/:orgId/photos')
  orgPhotos(@Param('orgId') orgId: string, @Query() q: OrgPhotoListQuery) {
    return this.gallery.orgPhotos(orgId, q);
  }

  @Public()
  @Get('public/events/:eventId/photos')
  publicForEvent(@Param('eventId') eventId: string, @Query() q: PhotoListQuery) {
    return this.gallery.publicForEvent(eventId, q);
  }

  @Public()
  @Get('public/photos/:photoId/image')
  async publicImage(@Param('photoId') photoId: string, @Query() q: PhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.gallery.publicImage(photoId, q.size), PUBLIC_DAY);
  }
}
