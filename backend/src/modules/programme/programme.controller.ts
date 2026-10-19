import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { MAX_BANNER_BYTES, MAX_LOGO_BYTES, StoredImageLike, UploadedImageFile } from '../../common/images/image-info';
import { CreateProgrammeItemDto, UpdateProgrammeItemDto, UpsertProgrammeDayDto } from './programme.dto';
import { ProgrammeService } from './programme.service';

function sendImage(res: Response, img: StoredImageLike, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}

/** Public URLs carry ?v=<updatedAt>; an item can be unpublished, so a day's cache at most. */
const PUBLIC_DAY = 'public, max-age=86400';
const PRIVATE_LONG = 'private, max-age=31536000, immutable';

@Controller()
export class ProgrammeController {
  constructor(private readonly programme: ProgrammeService) {}

  // ─── Organiser ───────────────────────────────────────────────────────

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/programme')
  view(@Param('eventId') eventId: string) {
    return this.programme.adminView(eventId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Put('events/:eventId/programme/days/:date')
  upsertDay(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('date') date: string, @Body() dto: UpsertProgrammeDayDto) {
    return this.programme.upsertDay(user, eventId, date, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Post('events/:eventId/programme/days/:date/copy-to/:to')
  copyDay(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('date') date: string, @Param('to') to: string) {
    return this.programme.copyDay(user, eventId, date, to);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Post('events/:eventId/programme/items')
  create(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: CreateProgrammeItemDto) {
    return this.programme.create(user, eventId, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Patch('events/:eventId/programme/items/:itemId')
  update(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string, @Body() dto: UpdateProgrammeItemDto) {
    return this.programme.update(user, eventId, itemId, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Delete('events/:eventId/programme/items/:itemId')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string) {
    await this.programme.remove(user, eventId, itemId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Put('events/:eventId/programme/items/:itemId/poster')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BANNER_BYTES, files: 1 } }))
  setPoster(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string, @UploadedFile() file: UploadedImageFile) {
    return this.programme.setPoster(user, eventId, itemId, file);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Delete('events/:eventId/programme/items/:itemId/poster')
  removePoster(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string) {
    return this.programme.removePoster(user, eventId, itemId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Put('events/:eventId/programme/items/:itemId/guests/:guestId/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }))
  setGuestPhoto(
    @CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string, @Param('guestId') guestId: string,
    @UploadedFile() file: UploadedImageFile,
  ) {
    return this.programme.setGuestPhoto(user, eventId, itemId, guestId, file);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Delete('events/:eventId/programme/items/:itemId/guests/:guestId/photo')
  removeGuestPhoto(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Param('itemId') itemId: string, @Param('guestId') guestId: string) {
    return this.programme.removeGuestPhoto(user, eventId, itemId, guestId);
  }

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/programme/images/poster/:id')
  async adminPoster(@Param('eventId') eventId: string, @Param('id') id: string, @Res() res: Response) {
    sendImage(res, await this.programme.adminImage(eventId, 'poster', id), PRIVATE_LONG);
  }

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/programme/images/photo/:id')
  async adminPhoto(@Param('eventId') eventId: string, @Param('id') id: string, @Res() res: Response) {
    sendImage(res, await this.programme.adminImage(eventId, 'photo', id), PRIVATE_LONG);
  }

  // ─── Public ──────────────────────────────────────────────────────────

  @Public()
  @Get('public/events/:eventId/programme')
  publicView(@Param('eventId') eventId: string) {
    return this.programme.publicView(eventId);
  }

  @Public()
  @Get('public/programme/items/:itemId/poster')
  async poster(@Param('itemId') itemId: string, @Res() res: Response) {
    sendImage(res, await this.programme.publicPoster(itemId), PUBLIC_DAY);
  }

  @Public()
  @Get('public/programme/guests/:guestId/photo')
  async guestPhoto(@Param('guestId') guestId: string, @Res() res: Response) {
    sendImage(res, await this.programme.publicGuestPhoto(guestId), PUBLIC_DAY);
  }
}
