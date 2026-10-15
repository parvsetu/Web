import { Controller, ForbiddenException, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireAnyEventPermission, RequireEventPermission, RequireOrgPermission } from '../../common/access/permission.guard';
import { toCsv } from '../../common/http';
import { ReportsService } from './reports.service';
import { DashboardQuery, MyScansQuery, ReportQuery, ScanLogQuery } from './reports.dto';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** JSON by default; `format=csv` (REPORT_EXPORT) sends the report's main table. */
  private send(res: Response, a: AccessContext, format: string | undefined, name: string, data: unknown, rows: () => Record<string, unknown>[]) {
    if (format !== 'csv') return res.json(data);
    if (!a.perms.has('REPORT_EXPORT')) {
      throw new ForbiddenException({ statusCode: 403, message: 'You do not have permission to export reports.', code: 'FORBIDDEN' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    return res.send(toCsv(rows()));
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/reports/tokens')
  async tokens(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.tokens(a.event!, q);
    return this.send(res, a, q.format, 'tokens', data, () => data.bySlot);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/reports/visitors')
  async visitors(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.visitors(a.event!, q);
    return this.send(res, a, q.format, 'visitors-by-date', data, () => data.byDate);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/reports/scans')
  async scans(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.scans(a.event!, q);
    return this.send(res, a, q.format, 'scans', data, () => [data]);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/reports/volunteers')
  async volunteers(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.volunteers(a.event!, q);
    return this.send(res, a, q.format, 'volunteers', data, () => data);
  }

  @RequireEventPermission('REPORT_VIEW', 'DONATION_VIEW', 'EXPENSE_VIEW')
  @Get('events/:eventId/reports/finance')
  async finance(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.finance(a.event!, q);
    return this.send(res, a, q.format, 'finance', data, () => [
      ...data.donations.byMethod.map((m) => ({ type: 'donation', key: m.method, total: m.total, count: m.count })),
      { type: 'pass_sales', key: 'online passes', total: data.passSales.total, count: data.passSales.count },
      { type: 'stall_rent', key: 'stall bookings (net of refunds)', total: data.stallRent.total, count: data.stallRent.bookings },
      ...data.expenses.byCategory.map((c) => ({ type: 'expense', key: c.category, total: c.total, count: c.count })),
    ]);
  }

  @RequireEventPermission('REPORT_VIEW', 'DONATION_VIEW')
  @Get('events/:eventId/reports/gst')
  async gst(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.gst(a.event!, q);
    // One register (same columns as before): pass invoices, then stall-rent invoices and stall credit notes (negative).
    return this.send(res, a, q.format, 'gst-invoices', data, () => [
      ...data.invoices.map((i) => ({ type: 'pass', ...i })),
      ...data.stallRent.invoices.map((i) => ({ type: 'stall', invoiceNo: i.invoiceNo, date: i.date, buyer: i.vendor, people: '', ratePercent: i.ratePercent, bearer: 'CUSTOMER', taxable: i.taxable, gst: i.gst, total: i.total })),
      ...data.stallRent.creditNotes.map((n) => ({ type: 'stall_credit_note', invoiceNo: `${n.creditNoteNo} (against ${n.againstInvoice})`, date: n.date, buyer: n.vendor, people: '', ratePercent: n.ratePercent, bearer: 'CUSTOMER', taxable: `-${n.taxable}`, gst: `-${n.gst}`, total: `-${n.total}` })),
    ]);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/reports/summary')
  async summary(@Access() a: AccessContext, @Query() q: ReportQuery, @Res() res: Response) {
    const data = await this.reports.summary(a.event!, a.perms, q);
    return this.send(res, a, q.format, 'summary', data, () => [{
      event: data.event.name, totalTokens: data.tokens.total, usedTokens: data.tokens.used, unusedTokens: data.tokens.unused,
      expiredTokens: data.tokens.expired, cancelledTokens: data.tokens.cancelled, visitors: data.visitors.total,
      donations: data.donations?.total ?? '', passSales: data.passSales?.total ?? '', stallRent: data.stallRent?.total ?? '', expenses: data.expenses?.total ?? '', balance: data.balance ?? '',
    }]);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/dashboard')
  dashboard(@Access() a: AccessContext, @Query() q: DashboardQuery) {
    return this.reports.dashboard(a.event!, a.perms, q);
  }

  @RequireEventPermission('REPORT_VIEW')
  @Get('events/:eventId/scans')
  async scanLog(@Access() a: AccessContext, @Query() q: ScanLogQuery, @Res() res: Response) {
    const data = await this.reports.scanLog(a.event!, q);
    return this.send(res, a, q.format, 'scan-log', data, () =>
      data.items.map((s) => ({ scanTime: s.scanTime, result: s.result, method: s.method, tokenCode: s.tokenCode, volunteer: s.user.name, voided: s.voided })));
  }

  @RequireAnyEventPermission('VOLUNTEER_VIEW', 'REPORT_VIEW')
  @Get('events/:eventId/volunteers/:userId/activity')
  activity(@Access() a: AccessContext, @Param('userId') userId: string) {
    return this.reports.volunteerActivity(a.event!, userId);
  }

  @RequireAnyEventPermission('TOKEN_SCAN', 'TOKEN_CREATE')
  @Get('events/:eventId/my-summary')
  mySummary(@CurrentUser() user: RequestUser, @Access() a: AccessContext) {
    return this.reports.mySummary(a.event!, user.id);
  }

  @RequireAnyEventPermission('TOKEN_SCAN', 'TOKEN_CREATE')
  @Get('me/scans')
  myScans(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Query() q: MyScansQuery) {
    return this.reports.scanLog(a.event!, { userId: user.id, page: q.page, pageSize: q.pageSize });
  }

  @RequireOrgPermission('REPORT_VIEW')
  @Get('organizations/:orgId/reports/events')
  orgEvents(@Param('orgId') orgId: string, @Access() a: AccessContext) {
    return this.reports.orgEvents(orgId, a.perms);
  }
}
