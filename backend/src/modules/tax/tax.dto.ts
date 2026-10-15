import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { PageQuery } from '../../common/http';
import { DONOR_ID_TYPE_KEYS } from './tax-rules';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Donor's ID for 80G / Form 10BD. Stored encrypted; responses only ever show it masked. */
export class DonorIdDto {
  @IsIn(DONOR_ID_TYPE_KEYS) idType: (typeof DONOR_ID_TYPE_KEYS)[number];
  @IsString() @Length(4, 40) idNumber: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}

/** The mandal's own 80G registration. No status / deduction fields — the server and the super admin decide those. */
export class TaxProfileDto {
  @Matches(/^[A-Za-z0-9]{10,30}$/, { message: 'URN is the 80G registration number, e.g. AAATS1234AF20214' }) urn: string;
  @Matches(DATE) urnIssuedOn: string;
  @Matches(DATE) validFrom: string;
  @IsOptional() @Matches(DATE) validTo?: string;
  @IsString() @Length(10, 12) pan: string;
  @IsOptional() @IsString() @MaxLength(40) sectionCode?: string;
}

export class ReviewTaxProfileDto {
  @IsIn(['VERIFY', 'REJECT']) decision: 'VERIFY' | 'REJECT';
  @IsOptional() @IsIn([50, 100]) deductionPercent?: 50 | 100;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class TaxProfileListQuery extends PageQuery {
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED']) status?: string;
}

export class FyQuery {
  @Matches(/^\d{4}-\d{2}$/, { message: 'fy looks like 2026-27' }) fy: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class File10BDDto {
  @IsString() @Length(4, 60) ackNumber: string;
  @Matches(DATE) filedOn: string;
}

export class Issue10BEDto {
  @Matches(/^[a-f0-9]{64}$/) donorKey: string;
  @IsString() @Length(4, 60) certificateNumber: string;
  @Matches(DATE) issuedOn: string;
}
