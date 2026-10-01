import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireOrgPermission } from '../../common/access/permission.guard';
import { toCsv } from '../../common/http';
import { ExpensesService } from './expenses.service';
import { AnnualReportService } from './annual-report.service';
import { AnnualReportQuery, CreateOrgExpenseDto, OrgExpenseListQuery, UpdateExpenseDto } from './expenses.dto';

/** Mandal Accounts: every expense (festival or general) and the yearly P&L. */
@Controller('organizations/:orgId')
export class AccountsController {
  constructor(private readonly expenses: ExpensesService, private readonly annual: AnnualReportService) {}

  @RequireOrgPermission('EXPENSE_VIEW')
  @Get('expenses')
  list(@Param('orgId') orgId: string, @Query() q: OrgExpenseListQuery) {
    return this.expenses.listForOrg(orgId, q);
  }

  @RequireOrgPermission('EXPENSE_CREATE')
  @Post('expenses')
  create(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: CreateOrgExpenseDto) {
    return this.expenses.createForOrg(user, orgId, dto);
  }

  @RequireOrgPermission('EXPENSE_UPDATE')
  @Patch('expenses/:id')
  update(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.updateForOrg(user, orgId, id, dto);
  }

  @RequireOrgPermission('REPORT_VIEW', 'DONATION_VIEW', 'EXPENSE_VIEW')
  @Get('reports/annual')
  async report(@Param('orgId') orgId: string, @Access() a: AccessContext, @Query() q: AnnualReportQuery, @Res() res: Response) {
    const data = await this.annual.report(orgId, Number(q.year), q.basis ?? 'calendar');
    if (q.format !== 'csv') return res.json(data);
    if (!a.perms.has('REPORT_EXPORT')) {
      throw new ForbiddenException({ statusCode: 403, message: 'You do not have permission to export reports.', code: 'FORBIDDEN' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="profit-loss-${data.label.replace(/\s+/g, '-')}.csv"`);
    return res.send(toCsv([
      ...data.byMonth.map((x) => ({ section: 'Month', name: x.label, donations: x.donations, passSales: x.passSales, income: x.income, expenses: x.expenses, net: x.net })),
      ...data.byEvent.map((x) => ({ section: 'Festival', name: x.name, donations: x.donations, passSales: x.passSales, income: '', expenses: x.expenses, net: x.net })),
      { section: 'Total', name: data.label, donations: data.income.donations, passSales: data.income.passSales, income: data.income.total, expenses: data.expenses.total, net: data.net },
    ]));
  }
}
