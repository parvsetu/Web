import { IsBoolean, IsEmail, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IssueTokenDto } from '../tokens/tokens.dto';
import { DonorIdDto } from '../tax/tax.dto';
import { MoneyField } from '../../common/money';
import { PageQuery } from '../../common/http';

export const DONATION_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER'] as const;
const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'] as const;

export class CreateDonationDto {
  /** Required unless isAnonymous; ignored (never stored) for an anonymous donation. */
  @IsOptional() @IsString() @Length(1, 150) donorName?: string;
  /** Anonymous donation (gupt daan): no name is stored; receipts and lists say "Anonymous donor". Mobile/email stay optional, only to deliver the receipt. */
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
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
  /** Donor PAN / ID for 80G (named donations only). Eligibility is decided by the server. */
  @IsOptional() @ValidateNested() @Type(() => DonorIdDto) taxId?: DonorIdDto;
}

export class UpdateDonationDto {
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?: (typeof PAYMENT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(120) paymentReference?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  /** One-way: the donor asked to be anonymous after the fact. Erases the stored name (and the name on their passes). */
  @IsOptional() @IsIn([true]) makeAnonymous?: true;
}

export class DonationListQuery extends PageQuery {
  @IsOptional() @IsIn(PAYMENT_STATUSES) status?: (typeof PAYMENT_STATUSES)[number];
  @IsOptional() @IsIn(DONATION_METHODS) method?: (typeof DONATION_METHODS)[number];
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/** A visitor donating on the public festival page (no login). Method, provider and status are the server's. */
export class CreatePublicDonationDto {
  @IsUUID() eventId: string;
  /** Required unless isAnonymous; never stored for an anonymous donation. */
  @IsOptional() @IsString() @Length(2, 150) donorName?: string;
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsString() @Length(10, 20) donorMobile?: string;
  @IsOptional() @IsEmail() @MaxLength(200) donorEmail?: string;
  @MoneyField() amount: string;
  /** PAN / ID for an 80G receipt (named donations only). Eligibility is decided by the server. */
  @IsOptional() @ValidateNested() @Type(() => DonorIdDto) taxId?: DonorIdDto;
}

export class DonationKeyQuery {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
}

export class DemoPayDonationDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}
