import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireEventPermission, RequireOrgPermission } from '../../common/access/permission.guard';
import { SponsorsService } from './sponsors.service';
import { CreateSponsorDto, UpdateSponsorDto } from './sponsors.dto';

@Controller()
export class SponsorsController {
  constructor(private readonly sponsors: SponsorsService) {}

  @RequireOrgPermission('EVENT_VIEW')
  @Get('organizations/:orgId/sponsors')
  list(@Param('orgId') orgId: string) {
    return this.sponsors.listForOrg(orgId);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Post('organizations/:orgId/sponsors')
  create(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: CreateSponsorDto) {
    return this.sponsors.create(user, orgId, dto);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Patch('organizations/:orgId/sponsors/:id')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: UpdateSponsorDto) {
    return this.sponsors.update(user, orgId, id, dto);
  }

  @RequireOrgPermission('SETTINGS_UPDATE')
  @Delete('organizations/:orgId/sponsors/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string) {
    await this.sponsors.remove(user, orgId, id);
  }

  /** Sponsors to show inside the app for a festival (volunteer home, etc.). */
  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/sponsors')
  forEvent(@Param('eventId') eventId: string) {
    return this.sponsors.forEvent(eventId);
  }

  @Public()
  @Get('public/events/:eventId/sponsors')
  publicForEvent(@Param('eventId') eventId: string) {
    return this.sponsors.forEvent(eventId);
  }

  @Public()
  @Get('public/sponsors/:id/logo')
  async logo(@Param('id') id: string, @Res() res: Response) {
    const { bytes, type } = await this.sponsors.logo(id);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(bytes);
  }
}
