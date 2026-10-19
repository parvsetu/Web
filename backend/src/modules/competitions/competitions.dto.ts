import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min,
  ValidateIf, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/http';
import { HHMM, YMD } from '../../common/time/validity';
import {
  CATEGORY_GENDERS, COMPETITION_KINDS, ENTRANT_GENDERS, MAX_CATEGORIES, MAX_LANES, RESULT_STATUSES, RESULT_TYPES,
} from './competitions.rules';

const MONEY = /^\d{1,6}(\.\d{1,2})?$/;

export class CompetitionCategoryDto {
  /** Existing category to keep/update; omitted = new. */
  @IsOptional() @IsUUID() id?: string;
  @IsString() @Length(2, 100) name: string;
  @IsOptional() @IsIn(CATEGORY_GENDERS) gender?: (typeof CATEGORY_GENDERS)[number];
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(3) @Max(100) minAge?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(3) @Max(100) maxAge?: number | null;
  /** Rupees, e.g. "200" — 0 / empty = free. */
  @IsOptional() @Matches(MONEY, { message: 'fee must be an amount like 200 or 99.50' }) fee?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(5000) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCompetitionDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsIn(COMPETITION_KINDS) kind?: (typeof COMPETITION_KINDS)[number];
  @IsOptional() @IsIn(RESULT_TYPES) resultType?: (typeof RESULT_TYPES)[number];
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @IsString() @MaxLength(5000) rules?: string;
  @Matches(YMD, { message: 'date must be YYYY-MM-DD' }) date: string;
  @Matches(HHMM, { message: 'startTime must be HH:mm' }) startTime: string;
  @IsOptional() @IsString() @MaxLength(120) venue?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(['INDOOR', 'OUTDOOR']) setting?: 'INDOOR' | 'OUTDOOR' | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(2) @Max(MAX_LANES) lanes?: number | null;
  @IsOptional() @IsBoolean() registrationOpen?: boolean;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsISO8601() registrationClosesAt?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) safetyDeclaration?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_CATEGORIES) @ValidateNested({ each: true }) @Type(() => CompetitionCategoryDto) categories?: CompetitionCategoryDto[];
}

export class UpdateCompetitionDto extends CreateCompetitionDto {
  @IsOptional() @IsString() @Length(2, 120) declare name: string;
  @IsOptional() @Matches(YMD, { message: 'date must be YYYY-MM-DD' }) declare date: string;
  @IsOptional() @Matches(HHMM, { message: 'startTime must be HH:mm' }) declare startTime: string;
  @IsOptional() @IsBoolean() resultsPublished?: boolean;
}

export class EntryListQuery extends PageQuery {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED']) status?: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class CheckInDto {
  /** The entry id (from the entrant's QR) or the bib number. */
  @IsOptional() @IsUUID() entryId?: string;
  @IsOptional() @IsInt() @Min(1) bibNo?: number;
  /** false = undo a check-in. */
  @IsOptional() @IsBoolean() checkedIn?: boolean;
}

export class AssignHeatsDto {
  @IsUUID() categoryId: string;
  /** Only people who checked in (default) or every paid entry. */
  @IsOptional() @IsBoolean() onlyCheckedIn?: boolean;
  /** Start numbering heats from this (several categories in one session). */
  @IsOptional() @IsInt() @Min(1) @Max(500) firstHeat?: number;
}

export class ResultDto {
  @IsIn(RESULT_STATUSES) resultStatus: (typeof RESULT_STATUSES)[number];
  /** TIME competitions: "1:05.32". */
  @IsOptional() @IsString() @MaxLength(20) time?: string;
  /** SCORE competitions. */
  @IsOptional() @Matches(/^\d{1,6}(\.\d{1,2})?$/, { message: 'score must be a number like 8.75' }) score?: string;
  /** RANK competitions (judges' placing). */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(5000) rank?: number | null;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(500) heat?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(MAX_LANES) lane?: number | null;
}

export class ClearResultDto {}

export class CancelEntryDto {
  @IsString() @Length(3, 300) reason: string;
  /** Rupees refunded (default: everything paid). */
  @IsOptional() @Matches(MONEY) refund?: string;
  @IsOptional() @IsString() @MaxLength(100) refundReference?: string;
}

/** Public entry form. */
export class CreateEntryDto {
  @IsUUID() categoryId: string;
  @IsString() @Length(2, 100) participantName: string;
  @Matches(YMD, { message: 'dateOfBirth must be YYYY-MM-DD' }) dateOfBirth: string;
  @IsIn(ENTRANT_GENDERS) gender: (typeof ENTRANT_GENDERS)[number];
  @IsString() @MaxLength(20) phone: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(100) guardianName?: string;
  @IsOptional() @IsString() @MaxLength(20) guardianPhone?: string;
  @IsOptional() @IsBoolean() guardianConsent?: boolean;
  @IsString() @Length(2, 100) emergencyName: string;
  @IsString() @MaxLength(20) emergencyPhone: string;
  /** Rules (+ safety declaration, if the competition has one) accepted. */
  @IsBoolean() acceptDeclaration: boolean;
}

export class EntryKeyQuery {
  @IsString() @Length(10, 100) k: string;
}

export class DemoPayEntryDto {
  @IsString() @Length(10, 100) k: string;
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}
