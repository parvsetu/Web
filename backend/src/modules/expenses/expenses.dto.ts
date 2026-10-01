import { IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { MoneyField } from '../../common/money';
import { PageQuery } from '../../common/http';

export class CreateExpenseDto {
  @IsString() @Length(1, 80) category: string;
  @IsString() @Length(1, 500) description: string;
  @MoneyField() amount: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) expenseDate: string;
  @IsOptional() @IsString() @MaxLength(150) vendor?: string;
  @IsOptional() @IsString() @MaxLength(300) receiptRef?: string;
}

/** Mandal-level entry: eventId optional (omitted = general mandal expense). */
export class CreateOrgExpenseDto extends CreateExpenseDto {
  @IsOptional() @IsUUID() eventId?: string;
}

export class UpdateExpenseDto {
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsString() @Length(1, 500) description?: string;
  @IsOptional() @MoneyField() amount?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) expenseDate?: string;
  @IsOptional() @IsString() @MaxLength(150) vendor?: string;
  @IsOptional() @IsString() @MaxLength(300) receiptRef?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ExpenseListQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}

export class OrgExpenseListQuery extends ExpenseListQuery {
  /** An event id, or "none" for general mandal expenses only. */
  @IsOptional() @Matches(/^(none|[0-9a-f-]{36})$/) eventId?: string;
}

export class AnnualReportQuery {
  @Matches(/^\d{4}$/) year: string;
  @IsOptional() @IsIn(['calendar', 'financial']) basis?: 'calendar' | 'financial';
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}
