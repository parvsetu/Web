import {
  Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Patch, Post, Put, Query, Res, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UploadedImageFile } from '../../common/images/image-info';
import { AchievementsService, MAX_ACHIEVEMENT_IMAGE_BYTES } from './achievements.service';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { LandingService } from './landing.service';
import {
  AchievementImageQuery, CreateAchievementDto, GrantLandingDto, LandingPayResultDto, ReorderAchievementsDto, RevokeLandingDto,
  UpdateAchievementDto, UpdateLandingPageDto, UpdateLayoutDto,
} from './landing.dto';

function sendImage(res: Response, img: { bytes: Buffer; mimeType: string }, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}


@Controller()
export class LandingController {
  constructor(private readonly landing: LandingService, private readonly prisma: PrismaService, private readonly achievements: AchievementsService) {}

  // ─── Mandal ──────────────────────────────────────────────────────────

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/landing-page')
  status(@Param('orgId') orgId: string) {
    return this.landing.status(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/landing-page')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: UpdateLandingPageDto) {
    return this.landing.update(user.id, orgId, dto);
  }

  /** The page as visitors will see it, even before it is paid (for the editor's preview). */
  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/landing-page/preview')
  async preview(@Param('orgId') orgId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
    return this.landing.publicPage(org.slug, true);
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/landing-page/layout')
  layout(@Param('orgId') orgId: string) {
    return this.landing.layout(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/landing-page/layout')
  setLayout(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: UpdateLayoutDto) {
    return this.landing.setLayout(user.id, orgId, dto.sections);
  }

  // ─── Achievements (trophies & recognition) ───────────────────────────

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/achievements')
  listAchievements(@Param('orgId') orgId: string) {
    return this.achievements.list(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/achievements')
  createAchievement(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: CreateAchievementDto) {
    return this.achievements.create(user.id, orgId, dto);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/achievements/order')
  reorderAchievements(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: ReorderAchievementsDto) {
    return this.achievements.reorder(user.id, orgId, dto.ids);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Patch('organizations/:orgId/achievements/:id')
  updateAchievement(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: UpdateAchievementDto) {
    return this.achievements.update(user.id, orgId, id, dto);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Delete('organizations/:orgId/achievements/:id')
  @HttpCode(204)
  async deleteAchievement(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string) {
    await this.achievements.remove(user.id, orgId, id);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Put('organizations/:orgId/achievements/:id/image')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }], { limits: { fileSize: MAX_ACHIEVEMENT_IMAGE_BYTES, files: 2, fields: 2 } }))
  setAchievementImage(
    @CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string,
    @UploadedFiles() files: { file?: UploadedImageFile[]; thumb?: UploadedImageFile[] } = {},
  ) {
    return this.achievements.setImage(user.id, orgId, id, files?.file?.[0], files?.thumb?.[0]);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Delete('organizations/:orgId/achievements/:id/image')
  removeAchievementImage(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string) {
    return this.achievements.removeImage(user.id, orgId, id);
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/achievements/:id/image')
  async achievementImage(@Param('orgId') orgId: string, @Param('id') id: string, @Query() q: AchievementImageQuery, @Res() res: Response) {
    sendImage(res, await this.achievements.image(id, q.size, { organizationId: orgId }), 'private, max-age=300');
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/landing-page/purchases')
  start(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Online payment is not available yet. Contact the platform admin to activate your landing page.', code: 'PAYMENT_UNAVAILABLE' });
    return this.landing.startPurchase(user.id, orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/landing-page/purchases/:id/demo-pay')
  @HttpCode(200)
  demoPay(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: LandingPayResultDto) {
    if (!demoPaymentsEnabled()) throw new ForbiddenException({ statusCode: 403, message: 'Demo payments are off.', code: 'PAYMENT_UNAVAILABLE' });
    return this.landing.completePurchase(user.id, orgId, id, dto.outcome);
  }

  // ─── Super admin ─────────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/landing-pages/:orgId')
  adminStatus(@Param('orgId') orgId: string) {
    return this.landing.status(orgId);
  }

  @SuperAdminOnly()
  @Post('platform/landing-pages/:orgId/grant')
  @HttpCode(200)
  grant(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: GrantLandingDto) {
    return this.landing.grant(user.id, orgId, dto);
  }

  @SuperAdminOnly()
  @Post('platform/landing-pages/:orgId/revoke')
  @HttpCode(200)
  revoke(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: RevokeLandingDto) {
    return this.landing.revoke(user.id, orgId, dto.reason);
  }

  @SuperAdminOnly()
  @Get('platform/landing-purchases')
  purchases(@Query() q: PageQuery) {
    return this.landing.purchases(q);
  }

  // ─── Public ──────────────────────────────────────────────────────────

  @Public()
  @Get('public/landing/:slug')
  page(@Param('slug') slug: string) {
    return this.landing.publicPage(slug);
  }

  @Public()
  @Get('public/landing/:slug/reviews')
  reviews(@Param('slug') slug: string, @Query() q: PageQuery) {
    return this.landing.publicReviews(slug, q);
  }

  @Public()
  @Get('public/landing/:slug/visitor-photos')
  visitorPhotos(@Param('slug') slug: string, @Query() q: PageQuery) {
    return this.landing.publicVisitorPhotos(slug, q);
  }

  /** Visible achievements only. URLs carry ?v=<updatedAt>, but visibility can change, so a day's cache. */
  @Public()
  @Get('public/achievements/:id/image')
  async publicAchievementImage(@Param('id') id: string, @Query() q: AchievementImageQuery, @Res() res: Response) {
    sendImage(res, await this.achievements.image(id, q.size, { publicOnly: true }), 'public, max-age=86400');
  }
}
