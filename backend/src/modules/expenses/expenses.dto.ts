import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
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
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
