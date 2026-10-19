import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { HHMM, YMD } from '../../common/time/validity';
import { MAX_GUESTS_PER_ITEM, PROGRAMME_CATEGORIES, PROGRAMME_SETTINGS, PROGRAMME_STATUSES } from './programme.rules';

export class UpsertProgrammeDayDto {
  /** "Maha Ashtami" — empty clears. */
  @IsOptional() @IsString() @MaxLength(80) title?: string;
  /** "Colour of the day: Green", "Sandhi Puja at 11:42 pm". */
  @IsOptional() @IsString() @MaxLength(160) subtitle?: string;
}

export class ProgrammeGuestDto {
  /** Existing guest to keep/update; omitted = new guest. */
  @IsOptional() @IsUUID() id?: string;
  @IsString() @Length(1, 100) name: string;
  @IsOptional() @IsString() @MaxLength(80) role?: string;
  @IsOptional() @IsString() @MaxLength(600) bio?: string;
  @IsOptional() @IsString() @MaxLength(200) instagramUrl?: string;
}

export class CreateProgrammeItemDto {
  @Matches(YMD, { message: 'date must be YYYY-MM-DD' }) date: string;
  @Matches(HHMM, { message: 'startTime must be HH:mm' }) startTime: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '' && v !== null) @Matches(HHMM, { message: 'endTime must be HH:mm' }) endTime?: string | null;
  @IsString() @Length(2, 140) title: string;
  @IsOptional() @IsIn(PROGRAMME_CATEGORIES) category?: (typeof PROGRAMME_CATEGORIES)[number];
  @IsOptional() @IsString() @MaxLength(3000) description?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(PROGRAMME_SETTINGS) setting?: (typeof PROGRAMME_SETTINGS)[number] | null;
  @IsOptional() @IsString() @MaxLength(80) stage?: string;
  @IsOptional() @IsString() @MaxLength(80) language?: string;
  @IsOptional() @IsString() @MaxLength(30) ageLimit?: string;
  @IsOptional() @IsString() @MaxLength(300) videoUrl?: string;
  @IsOptional() @IsBoolean() isHeadline?: boolean;
  @IsOptional() @IsIn(PROGRAMME_STATUSES) status?: (typeof PROGRAMME_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(300) statusNote?: string;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  /** The full guest list; on update it replaces the old one (guests keep their photo by id). */
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_GUESTS_PER_ITEM) @ValidateNested({ each: true }) @Type(() => ProgrammeGuestDto) guests?: ProgrammeGuestDto[];
}

export class UpdateProgrammeItemDto extends CreateProgrammeItemDto {
  @IsOptional() @Matches(YMD, { message: 'date must be YYYY-MM-DD' }) declare date: string;
  @IsOptional() @Matches(HHMM, { message: 'startTime must be HH:mm' }) declare startTime: string;
  @IsOptional() @IsString() @Length(2, 140) declare title: string;
}
