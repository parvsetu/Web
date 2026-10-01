import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PageQuery } from '../../common/http';

const up = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value));
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const REGISTERED_TYPES = ['TRUST', 'SOCIETY', 'SECTION8', 'PARTNERSHIP', 'PROPRIETORSHIP', 'OTHER'] as const;

/**
 * Mandal payout (bank) account. Registered bodies (trust, society…) give the
 * organisation's PAN and registration; unregistered mandals use the
 * authorised committee member's PAN and an account in their / a joint name.
 */
export class PayoutAccountDto {
  @IsIn(['REGISTERED', 'UNREGISTERED']) entityType: 'REGISTERED' | 'UNREGISTERED';

  @ValidateIf((o) => o.entityType === 'REGISTERED') @IsIn(REGISTERED_TYPES) registeredType?: (typeof REGISTERED_TYPES)[number];
  @IsString() @Length(3, 150) legalName: string;
  @ValidateIf((o) => o.entityType === 'REGISTERED') @IsString() @Length(2, 60) registrationNumber?: string;
  @ValidateIf((o) => o.entityType === 'REGISTERED') @up() @Matches(PAN, { message: 'Organisation PAN must look like AAATS1234Z' }) orgPan?: string;
  @IsOptional() @up() @Matches(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, { message: 'GSTIN must be 15 characters, e.g. 19AAATS1234Z1Z5' }) gstin?: string;
  @IsOptional() @IsString() @MaxLength(60) reg80G?: string;
  @IsOptional() @IsString() @MaxLength(60) reg12A?: string;

  @IsString() @Length(5, 300) addressLine: string;
  @IsString() @Length(2, 100) city: string;
  @IsString() @Length(2, 80) state: string;
  @Matches(/^[1-9]\d{5}$/, { message: 'PIN code must be 6 digits' }) pincode: string;

  @IsString() @Length(2, 100) contactName: string;
  @IsString() @Length(2, 60) contactRole: string;
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Enter a 10-digit Indian mobile number' }) contactPhone: string;
  @IsEmail() contactEmail: string;
  @up() @Matches(PAN, { message: 'Authorised signatory PAN must look like ABCDE1234F' }) signatoryPan: string;

  @IsString() @Length(3, 150) bankHolderName: string;
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @Matches(/^\d{9,18}$/, { message: 'Account number must be 9–18 digits' }) bankAccount: string;
  @up() @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'IFSC must look like SBIN0001234' }) ifsc: string;
  @IsIn(['SAVINGS', 'CURRENT']) accountType: 'SAVINGS' | 'CURRENT';

  /** data:image/png|jpeg;base64,… or data:application/pdf;base64,… (≤ 2 MB). */
  @IsOptional() @IsString() @MaxLength(2_900_000) proofDataUrl?: string;

  @Equals(true, { message: 'Please confirm you are authorised to add this account' }) consent: boolean;
}

export class ReviewPayoutDto {
  @IsIn(['VERIFIED', 'NEEDS_CORRECTION', 'REJECTED']) decision: 'VERIFIED' | 'NEEDS_CORRECTION' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsString() @MaxLength(80) gatewayAccountId?: string;
}

export class PayoutListQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'VERIFIED', 'NEEDS_CORRECTION', 'REJECTED']) status?: string;
}

export class SettlementQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING_PAYOUT', 'PAID_OUT']) status?: string;
  @IsOptional() @IsString() organizationId?: string;
}

export class RecordPayoutDto {
  @IsString() organizationId: string;
  @IsString() @Length(4, 80) reference: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
