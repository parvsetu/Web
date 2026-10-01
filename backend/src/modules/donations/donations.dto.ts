import { IsEmail, IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IssueTokenDto } from '../tokens/tokens.dto';
import { MoneyField } from '../../common/money';
import { PageQuery } from '../../common/http';

export const DONATION_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER'] as const;
const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;

export class CreateDonationDto {
  @IsString() @Length(1, 150) donorName: string;
  @IsOptional() @IsString() @Length(10, 20) donorMobile?: string;
  @IsOptional() @IsEmail() donorEmail?: string;
  @MoneyField() amount: string;
  @IsIn(DONATION_METHODS) method: (typeof DONATION_METHODS)[number];
  @IsOptional() @IsString() @MaxLength(40) provider?: string;
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsISO8601() donatedAt?: string;
  /** Issue entry passes to the donor with this donation (validity + people + perPerson). */
  @IsOptional() @ValidateNested() @Type(() => IssueTokenDto) passes?: IssueTokenDto;
}

export class UpdateDonationDto {
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?: (typeof PAYMENT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class DonationListQuery extends PageQuery {
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: (typeof PAYMENT_STATUSES)[number];
  @IsOptional() @IsIn(DONATION_METHODS) method?: (typeof DONATION_METHODS)[number];
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
