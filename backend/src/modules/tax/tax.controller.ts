import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, RequireOrgPermission, SuperAdminOnly } from '../../common/access/permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxService } from './tax.service';
import { DonorIdDto, File10BDDto, FyQuery, Issue10BEDto, ReviewTaxProfileDto, TaxProfileDto, TaxProfileListQuery } from './tax.dto';

@Controller()
export class TaxController {
  constructor(private readonly tax: TaxService, private readonly prisma: PrismaService) {}

  // ─── Mandal: 80G profile, Form 10BD / 10BE ─────────────────────────

  @RequireOrgPermission('DONATION_TAX_VIEW')
  @Get('organizations/:orgId/tax-profile')
  profile(@Param('orgId') orgId: string) {
    return this.tax.getProfile(orgId);
  }

  @RequireOrgPermission('DONATION_TAX_MANAGE')
  @Put('organizations/:orgId/tax-profile')
  saveProfile(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: TaxProfileDto) {
    return this.tax.saveProfile(u.id, orgId, dto);
  }

  /** Year summary (masked IDs). `format=csv` = the Form 10BD upload sheet with FULL donor IDs (manage + export, audited). */
  @RequireOrgPermission('DONATION_TAX_VIEW')
  @Get('organizations/:orgId/tax/year')
  async year(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('orgId') orgId: string, @Query() q: FyQuery, @Res() res: Response) {
    if (q.format !== 'csv') return res.json(await this.tax.year(orgId, q.fy));
    if (!a.perms.has('DONATION_TAX_MANAGE') || !a.perms.has('REPORT_EXPORT')) {
      throw new ForbiddenException({ statusCode: 403, code: 'FORBIDDEN', message: 'Exporting Form 10BD (full donor IDs) needs 80G management and export permissions.' });
    }
    const csv = await this.tax.export10BD(u.id, orgId, q.fy);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="form-10bd-${q.fy}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(csv);
  }

  @RequireOrgPermission('DONATION_TAX_MANAGE')
  @Post('organizations/:orgId/tax/years/:fy/form-10bd')
  @HttpCode(200)
  file(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('fy') fy: string, @Body() dto: File10BDDto) {
    return this.tax.file10BD(u.id, orgId, fy, dto);
  }

  @RequireOrgPermission('DONATION_TAX_MANAGE')
  @Post('organizations/:orgId/tax/years/:fy/form-10be')
  @HttpCode(200)
  issue(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Param('fy') fy: string, @Body() dto: Issue10BEDto) {
    return this.tax.issue10BE(u.id, orgId, fy, dto);
  }

  // ─── Per donation ──────────────────────────────────────────────────

  /** Adds / corrects the donor's PAN or other ID (re-evaluates 80G, re-issues the receipt version if it changes). */
  @RequireEventPermission('DONATION_TAX_MANAGE')
  @Put('events/:eventId/donations/:id/tax-id')
  async setId(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('id') id: string, @Body() dto: DonorIdDto) {
    await this.own(a, id);
    const r = await this.prisma.$transaction((tx) => this.tax.setDonorId(tx, id, dto, u.id));
    return this.tax.present(r, true);
  }

  @RequireEventPermission('DONATION_TAX_MANAGE')
  @Post('events/:eventId/donations/:id/tax-id/clear')
  @HttpCode(200)
  async clearId(@CurrentUser() u: RequestUser, @Access() a: AccessContext, @Param('id') id: string) {
    await this.own(a, id);
    const r = await this.prisma.$transaction((tx) => this.tax.setDonorId(tx, id, null, u.id));
    return this.tax.present(r, true);
  }

  /** Receipt versions (and their snapshots) for one donation. */
  @RequireEventPermission('DONATION_TAX_VIEW')
  @Get('events/:eventId/donations/:id/documents')
  async documents(@Access() a: AccessContext, @Param('id') id: string) {
    await this.own(a, id);
    return this.tax.documents(id);
  }

  /** By-id lookups are scoped by the URL's event (404 for another event's donation). */
  private async own(a: AccessContext, id: string) {
    const d = await this.prisma.donation.findFirst({ where: { id, eventId: a.event!.id }, select: { id: true } }).catch(() => null);
    if (!d) throw new NotFoundException('Donation not found');
  }

  // ─── Super admin ───────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/tax-profiles')
  list(@Query() q: TaxProfileListQuery) {
    return this.tax.listProfiles(q);
  }

  @SuperAdminOnly()
  @Post('platform/tax-profiles/:orgId/review')
  @HttpCode(200)
  review(@CurrentUser() u: RequestUser, @Param('orgId') orgId: string, @Body() dto: ReviewTaxProfileDto) {
    return this.tax.reviewProfile(u.id, orgId, dto);
  }
}
