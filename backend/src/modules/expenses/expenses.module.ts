import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { AccountsController } from './accounts.controller';
import { ExpensesService } from './expenses.service';
import { AnnualReportService } from './annual-report.service';

@Module({ controllers: [ExpensesController, AccountsController], providers: [ExpensesService, AnnualReportService] })
export class ExpensesModule {}
