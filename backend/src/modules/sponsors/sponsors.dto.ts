import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export const TIERS = ['TITLE', 'PLATINUM', 'GOLD', 'SILVER', 'PARTNER'] as const;

export class CreateSponsorDto {
  @IsString() @Length(2, 120) name: string;
  @IsOptional() @IsIn(TIERS) tier?: (typeof TIERS)[number];
  @IsOptional() @IsString() @MaxLength(160) tagline?: string;
  /** Ad / banner line shown on festival pages, passes and receipts. */
  @IsOptional() @IsString() @MaxLength(300) bannerText?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) @MaxLength(300) websiteUrl?: string;
  /** null/omitted = every festival of the mandal. */
  @IsOptional() @IsUUID() eventId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  /** Paid promotion: print logo + tagline on every pass (fee per pass from credit). */
  @IsOptional() @IsBoolean() showOnPasses?: boolean;
  /** data:image/png|jpeg|webp;base64,… (≤ 300 KB decoded). */
  @IsOptional() @IsString() @MaxLength(420_000) logoDataUrl?: string;
}

export class UpdateSponsorDto extends CreateSponsorDto {
  @IsOptional() @IsString() @Length(2, 120) declare name: string;
  @IsOptional() @IsBoolean() removeLogo?: boolean;
}
