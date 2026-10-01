import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { SearchPageQuery } from '../../common/http';
import { CustomFestivalDto } from '../events/events.dto';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RUPEES = /^\d{1,8}(\.\d{1,2})?$/;
const KEY = /^[A-Z][A-Z0-9_]{1,40}$/;

/** One festival the mandal wants to run: a catalog type, or "my event isn't listed" (custom). */
export class RegistrationEventDto {
  @ValidateIf((o) => !o.custom) @Matches(KEY, { message: 'festivalType must be a catalog key' }) festivalType?: string;
  @IsOptional() @ValidateNested() @Type(() => CustomFestivalDto) custom?: CustomFestivalDto;
  @IsString() @Length(2, 150) name: string;
  @Matches(DATE) startDate: string;
  @Matches(DATE) endDate: string;
  /** Venue / pandal name. */
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(500) venueAddress?: string;
}

/** Shared mandal fields (self, logged-in, agent). */
export class MandalDetailsDto {
  @IsString() @Length(2, 150) orgName: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsArray() @ArrayMinSize(1, { message: 'Add at least one festival or event' }) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => RegistrationEventDto)
  events: RegistrationEventDto[];
  /** Must be true — the content-policy declaration (checked in the service so the error is DECLARATION_REQUIRED). */
  @IsOptional() @IsBoolean() declarationAccepted?: boolean;
}

/** Public self-registration: also creates the applicant's account (email-code verified). */
export class SelfRegistrationDto extends MandalDetailsDto {
  @IsString() @Length(2, 100) contactName: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(8, 128) password: string;
  @IsOptional() @IsString() @MaxLength(20) referralCode?: string;
}

/** Already logged in: the account is the applicant. */
export class MyRegistrationDto extends MandalDetailsDto {
  @IsOptional() @IsString() @MaxLength(20) referralCode?: string;
}

/** Filed by a field agent on the mandal's behalf; the contact gets a set-password link. */
export class AgentRegistrationDto extends MandalDetailsDto {
  @IsString() @Length(2, 100) contactName: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsEmail() @MaxLength(200) email: string;
}

/** Applicant fixing a CHANGES_REQUESTED registration. */
export class UpdateRegistrationDto extends MandalDetailsDto {}

export class RegistrationListQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['PENDING_VERIFICATION', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']) status?: string;
}

export class ApproveEventChoiceDto {
  @IsInt() @Min(0) index: number;
  /** Override the quoted fee (₹). */
  @IsOptional() @Matches(RUPEES) fee?: string;
  /** Custom event only: also add its type to the public catalog for every mandal. */
  @IsOptional() @IsBoolean() addToCatalog?: boolean;
}

export class ApproveRegistrationDto {
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,60}$/) slug?: string;
  /** Extra allowed festival types beyond the requested events. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @Matches(KEY, { each: true }) extraFestivalTypes?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ApproveEventChoiceDto) events?: ApproveEventChoiceDto[];
}

export class NoteDto {
  @IsString() @Length(3, 1000) note: string;
}

export class ReasonDto {
  @IsString() @Length(3, 1000) reason: string;
}

export class SubmitEventDto {
  @IsOptional() @IsBoolean() declarationAccepted?: boolean;
}

export class ApproveEventDto {
  /** Locked fee (₹); defaults to the quote. */
  @IsOptional() @Matches(RUPEES) fee?: string;
  /** For a custom ("not listed") festival type: add it to the public catalog. */
  @IsOptional() @IsBoolean() addToCatalog?: boolean;
}

export class EventReviewQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'LIVE', 'REJECTED']) status?: string;
  @IsOptional() @IsString() organizationId?: string;
}

export class MarkPaidDto {
  @IsIn(['CASH', 'BANK_TRANSFER']) method: 'CASH' | 'BANK_TRANSFER';
  @IsString() @Length(2, 200) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class FeeDemoPayDto {
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

export class FeeQuoteQuery {
  @Matches(KEY) festivalType: string;
}

export class EventFeeRateDto {
  @IsIn(['TYPE', 'GROUP']) scope: 'TYPE' | 'GROUP';
  @IsString() @Length(1, 60) key: string;
  /** null removes the rate (falls back to group / default). */
  @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) fee: string | null;
}

export class UpdateCustomTypeDto {
  @IsOptional() @IsBoolean() inCatalog?: boolean;
  @IsOptional() @IsString() @Length(2, 80) label?: string;
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export class SetPasswordDto {
  @IsString() @Length(20, 200) token: string;
  @IsString() @Length(8, 128) password: string;
}
