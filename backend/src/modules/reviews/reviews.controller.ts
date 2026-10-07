import {
  Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req, Res, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Access, CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery } from '../../common/http';
import { StoredImageLike, UploadedImageFile } from '../../common/images/image-info';
import { ReviewScope, ReviewsService } from './reviews.service';
import {
  ApproveReviewDto, FeatureReviewDto, ModerateNoteDto, OwnReviewPhotoQuery, PlatformRemoveReviewDto, PublicReviewsQuery,
  ReportReviewDto, ReviewKeyQuery, ReviewListQuery, ReviewPhotoImageQuery, ReviewPhotoUpdateDto, SubmitReviewDto,
} from './reviews.dto';
import { MAX_REVIEW_PHOTO_BYTES, MAX_REVIEW_PHOTOS } from './reviews.rules';

function sendImage(res: Response, img: StoredImageLike, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}

/** An approved photo can be unpublished again, so public copies are cached for a day only. */
const PUBLIC_DAY = 'public, max-age=86400';
const PRIVATE_LONG = 'private, max-age=31536000, immutable';
const PRIVATE_SHORT = 'private, max-age=300';

const uploadFields = FileFieldsInterceptor(
  [{ name: 'files', maxCount: MAX_REVIEW_PHOTOS }, { name: 'thumbs', maxCount: MAX_REVIEW_PHOTOS }],
  { limits: { fileSize: MAX_REVIEW_PHOTO_BYTES, files: MAX_REVIEW_PHOTOS * 2, fields: 8 } },
);
/** Posting and reporting are per-IP limited (env-overridable so the e2e suite can post freely). */
const POST_LIMIT = Number(process.env.REVIEW_RATE_LIMIT_PER_MIN ?? 6);
const REPORT_LIMIT = Number(process.env.REVIEW_REPORT_RATE_LIMIT_PER_MIN ?? 5);

type Files = { files?: UploadedImageFile[]; thumbs?: UploadedImageFile[] };

/** Visitor side — no login; the order id + accessKey prove a paid booking. Rate limited per IP. */
@Public()
@Controller()
export class PublicReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('public/booking/orders/:orderId/review')
  forOrder(@Param('orderId') orderId: string, @Query() q: ReviewKeyQuery) {
    return this.reviews.forOrder(orderId, q.k);
  }

  @Throttle({ default: { limit: POST_LIMIT, ttl: 60_000 } })
  @Post('public/booking/orders/:orderId/review')
  @UseInterceptors(uploadFields)
  submit(@Param('orderId') orderId: string, @UploadedFiles() files: Files = {}, @Body() dto: SubmitReviewDto) {
    return this.reviews.submit(orderId, dto, files?.files ?? [], files?.thumbs ?? []);
  }

  @Throttle({ default: { limit: POST_LIMIT + 4, ttl: 60_000 } })
  @Put('public/booking/orders/:orderId/review')
  @UseInterceptors(uploadFields)
  edit(@Param('orderId') orderId: string, @UploadedFiles() files: Files = {}, @Body() dto: SubmitReviewDto) {
    return this.reviews.edit(orderId, dto, files?.files ?? [], files?.thumbs ?? []);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('public/booking/orders/:orderId/review/photos/:photoId/image')
  async ownPhoto(@Param('orderId') orderId: string, @Param('photoId') photoId: string, @Query() q: OwnReviewPhotoQuery, @Res() res: Response) {
    sendImage(res, await this.reviews.ownPhoto(orderId, q.k, photoId, q.size), PRIVATE_SHORT);
  }

  @Get('public/events/:eventId/reviews')
  forEvent(@Param('eventId') eventId: string, @Query() q: PublicReviewsQuery) {
    return this.reviews.publicForEvent(eventId, q);
  }

  @Get('public/review-photos/:photoId/image')
  async publicPhoto(@Param('photoId') photoId: string, @Query() q: ReviewPhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.reviews.publicPhoto(photoId, q.size), PUBLIC_DAY);
  }

  @Throttle({ default: { limit: REPORT_LIMIT, ttl: 60_000 } })
  @Post('public/reviews/:reviewId/report')
  @HttpCode(200)
  report(@Param('reviewId') reviewId: string, @Body() dto: ReportReviewDto, @Req() req: Request) {
    return this.reviews.report(reviewId, req.ip, dto);
  }
}

/** Mandal-wide moderation (all festivals). */
@Controller('organizations/:orgId/reviews')
export class OrgReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  private scope(orgId: string): ReviewScope {
    return { organizationId: orgId, base: `/organizations/${orgId}` };
  }

  @RequireOrgPermission('REVIEW_VIEW')
  @Get()
  list(@Param('orgId') orgId: string, @Query() q: ReviewListQuery) {
    return this.reviews.list(this.scope(orgId), q);
  }

  @RequireOrgPermission('REVIEW_VIEW')
  @Get('counts')
  counts(@Param('orgId') orgId: string) {
    return this.reviews.counts(this.scope(orgId));
  }

  @RequireOrgPermission('REVIEW_VIEW')
  @Get('photos/:photoId/image')
  async photo(@Param('orgId') orgId: string, @Param('photoId') photoId: string, @Query() q: ReviewPhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.reviews.mandalPhoto(this.scope(orgId), photoId, q.size), PRIVATE_LONG);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: ApproveReviewDto) {
    return this.reviews.approve(u.id, this.scope(orgId), id, dto);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: ModerateNoteDto) {
    return this.reviews.reject(u.id, this.scope(orgId), id, dto.note);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Post(':id/hide')
  @HttpCode(200)
  hide(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: ModerateNoteDto) {
    return this.reviews.hide(u.id, this.scope(orgId), id, dto.note);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Post(':id/feature')
  @HttpCode(200)
  feature(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: FeatureReviewDto) {
    return this.reviews.feature(u.id, this.scope(orgId), id, dto.featured);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Patch(':id/photos/:photoId')
  photoApproved(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Param('photoId') photoId: string, @Body() dto: ReviewPhotoUpdateDto) {
    return this.reviews.setPhotoApproved(u.id, this.scope(orgId), id, photoId, dto.approved);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Delete(':id/photos/:photoId')
  removePhoto(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Param('photoId') photoId: string) {
    return this.reviews.removePhoto(u.id, this.scope(orgId), id, photoId);
  }

  @RequireOrgPermission('REVIEW_MANAGE')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string) {
    await this.reviews.remove(u.id, this.scope(orgId), id);
  }
}

/** One festival's reviews — for event-assigned moderators too. */
@Controller('events/:eventId/reviews')
export class EventReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  private scope(a: AccessContext, eventId: string): ReviewScope {
    return { organizationId: a.organizationId, eventId, base: `/events/${eventId}` };
  }

  @RequireEventPermission('REVIEW_VIEW')
  @Get()
  list(@Access() a: AccessContext, @Param('eventId') eventId: string, @Query() q: ReviewListQuery) {
    return this.reviews.list(this.scope(a, eventId), q);
  }

  @RequireEventPermission('REVIEW_VIEW')
  @Get('counts')
  counts(@Access() a: AccessContext, @Param('eventId') eventId: string) {
    return this.reviews.counts(this.scope(a, eventId));
  }

  @RequireEventPermission('REVIEW_VIEW')
  @Get('photos/:photoId/image')
  async photo(@Access() a: AccessContext, @Param('eventId') eventId: string, @Param('photoId') photoId: string, @Query() q: ReviewPhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.reviews.mandalPhoto(this.scope(a, eventId), photoId, q.size), PRIVATE_LONG);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: ApproveReviewDto) {
    return this.reviews.approve(u.id, this.scope(a, eventId), id, dto);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: ModerateNoteDto) {
    return this.reviews.reject(u.id, this.scope(a, eventId), id, dto.note);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Post(':id/hide')
  @HttpCode(200)
  hide(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: ModerateNoteDto) {
    return this.reviews.hide(u.id, this.scope(a, eventId), id, dto.note);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Post(':id/feature')
  @HttpCode(200)
  feature(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: FeatureReviewDto) {
    return this.reviews.feature(u.id, this.scope(a, eventId), id, dto.featured);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Patch(':id/photos/:photoId')
  photoApproved(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Param('photoId') photoId: string, @Body() dto: ReviewPhotoUpdateDto) {
    return this.reviews.setPhotoApproved(u.id, this.scope(a, eventId), id, photoId, dto.approved);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Delete(':id/photos/:photoId')
  removePhoto(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string, @Param('photoId') photoId: string) {
    return this.reviews.removePhoto(u.id, this.scope(a, eventId), id, photoId);
  }

  @RequireEventPermission('REVIEW_MANAGE')
  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('id') id: string) {
    await this.reviews.remove(u.id, this.scope(a, eventId), id);
  }
}

/** Super admin: reported reviews across all mandals. */
@SuperAdminOnly()
@Controller('platform/reviews')
export class PlatformReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reported')
  reported(@Query() q: PageQuery) {
    return this.reviews.reported(q);
  }

  @Get('photos/:photoId/image')
  async photo(@Param('photoId') photoId: string, @Query() q: ReviewPhotoImageQuery, @Res() res: Response) {
    sendImage(res, await this.reviews.platformPhoto(photoId, q.size), PRIVATE_LONG);
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@CurrentUser() u: RequestUser, @Param('id') id: string) {
    return this.reviews.platformRestore(u.id, id);
  }

  @Post(':id/remove')
  @HttpCode(204)
  async remove(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: PlatformRemoveReviewDto) {
    await this.reviews.platformRemove(u.id, id, dto.reason);
  }
}
