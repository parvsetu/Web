import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireOrgPermission } from '../../common/access/permission.guard';
import { InstagramService } from './instagram.service';
import { InstagramCallbackDto, InstagramDisconnectDto, InstagramIdsDto, InstagramMediaQuery, SignedRequestDto } from './instagram.dto';

function sendImage(res: Response, img: { bytes: Buffer; mimeType: string }, cache: string) {
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Cache-Control', cache);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(img.bytes);
}

@Controller()
export class InstagramController {
  constructor(private readonly ig: InstagramService) {}

  // ─── Mandal (landing-page settings permissions) ────────────────────

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/instagram')
  status(@Param('orgId') orgId: string) {
    return this.ig.status(orgId);
  }

  /** Where to send the admin to log in with Instagram (signed state, 10 minutes). */
  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/instagram/connect')
  @HttpCode(200)
  connect(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string) {
    return this.ig.connectUrl(u, orgId);
  }

  /** The frontend's /instagram/callback page posts what Instagram returned. The mandal comes from the signed state. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('instagram/callback')
  @HttpCode(200)
  callback(@CurrentUser() u: RequestUser, @Body() dto: InstagramCallbackDto) {
    return this.ig.callback(u, dto.code, dto.state);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post('organizations/:orgId/instagram/sync')
  @HttpCode(200)
  sync(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string) {
    return this.ig.sync(orgId, u.id);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/instagram/disconnect')
  @HttpCode(200)
  disconnect(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: InstagramDisconnectDto) {
    return this.ig.disconnect(u, orgId, dto.removePhotos ?? false);
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Get('organizations/:orgId/instagram/media')
  list(@Param('orgId') orgId: string, @Query() q: InstagramMediaQuery) {
    return this.ig.list(orgId, q);
  }

  @RequireOrgPermission('SETTINGS_VIEW')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('organizations/:orgId/instagram/media/:id/image')
  async image(@Param('orgId') orgId: string, @Param('id') id: string, @Res() res: Response) {
    sendImage(res, await this.ig.image(orgId, id), 'private, max-age=3600');
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/instagram/media/approve')
  @HttpCode(200)
  approve(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: InstagramIdsDto) {
    return this.ig.approve(u, orgId, dto.ids);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/instagram/media/reject')
  @HttpCode(200)
  reject(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: InstagramIdsDto) {
    return this.ig.reject(u, orgId, dto.ids);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/instagram/media/restore')
  @HttpCode(200)
  restore(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: InstagramIdsDto) {
    return this.ig.restore(u, orgId, dto.ids);
  }

  // ─── Public ────────────────────────────────────────────────────────

  @Public()
  @Get('public/instagram/:id/image')
  async publicImage(@Param('id') id: string, @Res() res: Response) {
    // Hidden photos must disappear, so cache for a day only.
    sendImage(res, await this.ig.publicImage(id), 'public, max-age=86400');
  }

  /** Meta: the person removed the app from their Instagram (signed_request). */
  @Public()
  @Post('public/instagram/deauthorize')
  @HttpCode(200)
  deauthorize(@Body() dto: SignedRequestDto) {
    return this.ig.deauthorize(dto.signed_request);
  }

  /** Meta: data-deletion request (signed_request) → { url, confirmation_code }. */
  @Public()
  @Post('public/instagram/data-deletion')
  @HttpCode(200)
  deletion(@Body() dto: SignedRequestDto) {
    return this.ig.deleteData(dto.signed_request);
  }
}
