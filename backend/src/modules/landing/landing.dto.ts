import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested,
} from 'class-validator';
import { LANDING_THEMES, LandingTheme, MAX_HIGHLIGHTS } from './landing.rules';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Everything a mandal may edit. paidUntil is deliberately absent (forbidNonWhitelisted → 400). */
export class UpdateLandingPageDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) headline?: string;
  @IsOptional() @IsString() @MaxLength(4000) about?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(MAX_HIGHLIGHTS, { message: `At most ${MAX_HIGHLIGHTS} highlights` })
  @IsString({ each: true }) @Length(1, 80, { each: true, message: 'Each highlight must be 1–80 characters' }) highlights?: string[];
  @IsOptional() @Transform(trim) @ValidateIf((_o, v) => v !== '') @Matches(/^\+?[\d\s-]{8,20}$/, { message: 'contactPhone must be a phone number' }) contactPhone?: string;
  @IsOptional() @Transform(trim) @ValidateIf((_o, v) => v !== '') @IsEmail({}, { message: 'contactEmail must be an email address' }) @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(300) instagramUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) facebookUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) youtubeUrl?: string;
  @IsOptional() @IsString() @MaxLength(25) whatsappNumber?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) featuredEventIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsUUID('all', { each: true }) photoIds?: string[];
  @IsOptional() @IsIn(LANDING_THEMES) themeColor?: LandingTheme;
}

export class LandingPayResultDto {
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

/** Super admin: extend by N years, or set an explicit end date. */
export class GrantLandingDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) years?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) until?: string;
  @IsString() @Length(3, 300) reason: string;
}

export class RevokeLandingDto {
  @IsString() @Length(3, 300) reason: string;
}

// ─── Achievements ───────────────────────────────────────────────────────

const ICONS = ['TROPHY', 'MEDAL', 'STAR', 'RIBBON', 'CERTIFICATE', 'CROWN'] as const;

export class CreateAchievementDto {
  @IsString() @Length(1, 120) title: string;
  @IsOptional() @IsInt() @Min(1800) @Max(2200) year?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(120) awardedBy?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsIn(ICONS) icon?: (typeof ICONS)[number];
  @IsOptional() @IsBoolean() isVisible?: boolean;
}

export class UpdateAchievementDto {
  @IsOptional() @IsString() @Length(1, 120) title?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1800) @Max(2200) year?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(120) awardedBy?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsIn(ICONS) icon?: (typeof ICONS)[number];
  @IsOptional() @IsBoolean() isVisible?: boolean;
}

export class ReorderAchievementsDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) ids: string[];
}

export class AchievementImageQuery {
  @IsOptional() @IsIn(['thumb', 'full']) size?: 'thumb' | 'full';
  /** Cache-buster only. */
  @IsOptional() @IsString() @MaxLength(20) v?: string;
}

// ─── Layout ─────────────────────────────────────────────────────────────

export class LayoutSectionDto {
  @IsString() @MaxLength(40) id: string;
  @IsBoolean() visible: boolean;
  @IsOptional() @IsString() @MaxLength(20) variant?: string;
}

export class UpdateLayoutDto {
  @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => LayoutSectionDto) sections: LayoutSectionDto[];
}
