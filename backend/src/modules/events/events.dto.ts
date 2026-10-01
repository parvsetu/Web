import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { FESTIVAL_GROUPS } from '../../common/catalog/festival-catalog.service';
import { VenueFields } from '../../common/venue';

const STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

/** "My event isn't listed": proposed as a custom festival type, reviewed by the platform. */
export class CustomFestivalDto {
  @IsString() @Length(2, 80) name: string;
  @IsIn(FESTIVAL_GROUPS, { message: 'group must be one of the catalog categories' }) group: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class CreateEventDto extends VenueFields {
  @IsString() @Length(2, 150) name: string;
  @ValidateIf((o) => !o.customFestival) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,40}$/, { message: 'festivalType must be an UPPER_SNAKE key, e.g. DURGA_PUJA' }) festivalType?: string;
  @IsOptional() @ValidateNested() @Type(() => CustomFestivalDto) customFestival?: CustomFestivalDto;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @Matches(/^[A-Z0-9]{2,6}$/, { message: 'tokenPrefix must be 2-6 uppercase letters/digits' }) tokenPrefix?: string;
  @IsOptional() @IsBoolean() volunteerRegistrationOpen?: boolean;
  @IsOptional() @IsBoolean() publicBookingEnabled?: boolean;
  @IsOptional() @IsBoolean() gstEnabled?: boolean;
  @IsOptional() @IsIn([0, 5, 12, 18, 28]) gstRatePercent?: number;
  @IsOptional() @IsIn(['FLAT', 'SLAB']) gstMode?: 'FLAT' | 'SLAB';
  @IsOptional() @IsIn([0, 5, 12, 18, 28]) gstLowRatePercent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) gstSlabThreshold?: number;
  @IsOptional() @IsIn(['CUSTOMER', 'MANDAL']) gstBearer?: 'CUSTOMER' | 'MANDAL';
  @IsOptional() @Matches(/^\d{4,8}$/, { message: 'SAC/HSN code must be 4–8 digits' }) gstSac?: string;
  /** Deprecated — ignored (the platform sets the pass layout per mandal); still accepted so old clients don't 400. */
  @IsOptional() @IsIn(['A4', 'THERMAL_80', 'THERMAL_58']) passPrintFormat?: 'A4' | 'THERMAL_80' | 'THERMAL_58';
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsInt({ each: true }) @Min(1, { each: true }) @Max(744, { each: true }) tokenDurationOptions?: number[];
  @IsOptional() @IsInt() @Min(1) @Max(100) maxVisitorsPerToken?: number;
}

export class UpdateEventDto extends VenueFields {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,40}$/) festivalType?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @Matches(/^[A-Z0-9]{2,6}$/) tokenPrefix?: string;
  @IsOptional() @IsBoolean() volunteerRegistrationOpen?: boolean;
  @IsOptional() @IsBoolean() publicBookingEnabled?: boolean;
  @IsOptional() @IsBoolean() gstEnabled?: boolean;
  @IsOptional() @IsIn([0, 5, 12, 18, 28]) gstRatePercent?: number;
  @IsOptional() @IsIn(['FLAT', 'SLAB']) gstMode?: 'FLAT' | 'SLAB';
  @IsOptional() @IsIn([0, 5, 12, 18, 28]) gstLowRatePercent?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) gstSlabThreshold?: number;
  @IsOptional() @IsIn(['CUSTOMER', 'MANDAL']) gstBearer?: 'CUSTOMER' | 'MANDAL';
  @IsOptional() @Matches(/^\d{4,8}$/, { message: 'SAC/HSN code must be 4–8 digits' }) gstSac?: string;
  /** Deprecated — ignored (the platform sets the pass layout per mandal); still accepted so old clients don't 400. */
  @IsOptional() @IsIn(['A4', 'THERMAL_80', 'THERMAL_58']) passPrintFormat?: 'A4' | 'THERMAL_80' | 'THERMAL_58';
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsInt({ each: true }) @Min(1, { each: true }) @Max(744, { each: true }) tokenDurationOptions?: number[];
  @IsOptional() @IsInt() @Min(1) @Max(100) maxVisitorsPerToken?: number;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateTimeSlotDto {
  @IsString() @Length(1, 80) label: string;
  @Matches(HHMM, { message: 'startTime must be HH:mm' }) startTime: string;
  @Matches(HHMM, { message: 'endTime must be HH:mm' }) endTime: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  /** Price per person for public booking; "0" = free. */
  @IsOptional() @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'price must be an amount like 50 or 99.50' }) price?: string;
}

export class UpdateTimeSlotDto {
  @IsOptional() @IsString() @Length(1, 80) label?: string;
  @IsOptional() @Matches(HHMM) startTime?: string;
  @IsOptional() @Matches(HHMM) endTime?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  /** Price per person for public booking; "0" = free. */
  @IsOptional() @Transform(({ value }) => (value === undefined || value === null ? value : String(value).trim()))
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'price must be an amount like 50 or 99.50' }) price?: string;
}

export class CreateAssignmentDto {
  @IsUUID() userId: string;
  @IsUUID() roleId: string;
}

export class UpdateAssignmentDto {
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
