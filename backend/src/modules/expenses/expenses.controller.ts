import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission } from '../../common/access/permission.guard';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, ExpenseListQuery, UpdateExpenseDto } from './expenses.dto';

@Controller('events/:eventId/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @RequireEventPermission('EXPENSE_VIEW')
  @Get()
  list(@Access() a: AccessContext, @Query() q: ExpenseListQuery) {
    return this.expenses.list(a.event!, q);
  }

  @RequireEventPermission('EXPENSE_CREATE')
  @Post()
  create(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user, a.event!, dto);
  }

  @RequireEventPermission('EXPENSE_UPDATE')
  @Patch(':id')
  update(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.expenses.update(user, a.event!, id, dto);
  }
}
