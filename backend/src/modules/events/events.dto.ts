import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;

export class CreateEventDto {
  @IsString() @Length(2, 150) name: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,40}$/, { message: 'festivalType must be an UPPER_SNAKE key, e.g. DURGA_PUJA' }) festivalType: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @Matches(/^[A-Z0-9]{2,6}$/, { message: 'tokenPrefix must be 2-6 uppercase letters/digits' }) tokenPrefix?: string;
  @IsOptional() @IsBoolean() volunteerRegistrationOpen?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxVisitorsPerToken?: number;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,40}$/) festivalType?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsString() @MaxLength(60) timezone?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @Matches(/^[A-Z0-9]{2,6}$/) tokenPrefix?: string;
  @IsOptional() @IsBoolean() volunteerRegistrationOpen?: boolean;
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
}

export class UpdateTimeSlotDto {
  @IsOptional() @IsString() @Length(1, 80) label?: string;
  @IsOptional() @Matches(HHMM) startTime?: string;
  @IsOptional() @Matches(HHMM) endTime?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) capacity?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
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
