import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/http';

/** Either { timeSlotId, date } or { validFrom, validUntil }. */
export class ValidityDto {
  @IsOptional() @IsUUID() timeSlotId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsISO8601({ strict: true }) validFrom?: string;
  @IsOptional() @IsISO8601({ strict: true }) validUntil?: string;
}

export class IssueTokenDto extends ValidityDto {
  @IsOptional() @IsString() @Length(1, 100) visitorName?: string;
  @IsOptional() @IsString() @Length(10, 20) visitorMobile?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) visitorCount?: number;
}

export class BulkGenerateDto extends ValidityDto {
  @IsInt() @Min(1) @Max(1000) count: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) visitorCount?: number;
}

export class TokenListQuery extends PageQuery {
  @IsOptional() @IsIn(['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED', 'NOT_YET_VALID']) status?: string;
  @IsOptional() @IsUUID() timeSlotId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @IsOptional() @IsString() @MaxLength(100) @Type(() => String) q?: string;
}

export class CancelTokenDto {
  @IsString() @Length(3, 500) reason: string;
}

export class ChangeValidityDto extends ValidityDto {
  @IsString() @Length(3, 500) reason: string;
}

export class ReactivateTokenDto {
  @IsString() @Length(10, 500) reason: string;
  @IsString() @Length(3, 40) confirmTokenCode: string;
}

export class ScanDto {
  @IsUUID() eventId: string;
  @IsOptional() @IsString() @MaxLength(200) qrPayload?: string;
  @IsOptional() @IsString() @MaxLength(40) tokenCode?: string;
  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{8,64}$/, { message: 'idempotencyKey must be 8-64 URL-safe characters' })
  idempotencyKey?: string;
}
