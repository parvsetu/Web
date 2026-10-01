import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PageQuery, SearchPageQuery } from '../../common/http';

const up = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value));
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const RUPEES = /^\d{1,8}(\.\d{1,2})?$/;
const url = () => IsUrl({ protocols: ['https', 'http'], require_protocol: true });

export const PARTNER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
export const CAMPAIGN_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'PAUSED', 'ENDED', 'CANCELLED'] as const;

/** Public brand signup: a login (User) + a PENDING Partner the super admin reviews. */
export class PartnerSignupDto {
  @IsString() @Length(2, 120) brandName: string;
  @IsString() @Length(2, 100) contactName: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsString() @Length(8, 128) password: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @up() @Matches(GSTIN, { message: 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5' }) gstin?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @url() @MaxLength(300) websiteUrl?: string;
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() @Length(2, 120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @up() @Matches(GSTIN, { message: 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5' }) gstin?: string;
  @IsOptional() @IsString() @Length(2, 100) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @Length(10, 20) contactPhone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @url() @MaxLength(300) websiteUrl?: string;
  /** Default line under the brand name on passes. */
  @IsOptional() @IsString() @MaxLength(120) tagline?: string;
  /** data:image/png|jpeg|webp;base64,… (≤ 300 KB decoded) — same rules as sponsor logos. */
  @IsOptional() @IsString() @MaxLength(420_000) logoDataUrl?: string;
  @IsOptional() @IsBoolean() removeLogo?: boolean;
}

export class CreateCampaignDto {
  @IsUUID() organizationId: string;
  /** Omit/null = every festival of that mandal. */
  @IsOptional() @IsUUID() eventId?: string | null;
  /** Promo line printed on each pass. */
  @IsString() @Length(3, 120) message: string;
  @Matches(YMD, { message: 'startDate must be YYYY-MM-DD' }) startDate: string;
  @Matches(YMD, { message: 'endDate must be YYYY-MM-DD' }) endDate: string;
  /** Cap on passes printed (and so on spend); omit for no cap. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) maxPasses?: number;
}

export class MandalBrowseQuery extends SearchPageQuery {
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
}

export class CampaignListQuery extends PageQuery {
  @IsOptional() @IsIn(CAMPAIGN_STATUSES) status?: (typeof CAMPAIGN_STATUSES)[number];
}

export class AdminCampaignQuery extends CampaignListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsUUID() partnerId?: string;
}

export class AdminPartnerQuery extends SearchPageQuery {
  @IsOptional() @IsIn(PARTNER_STATUSES) status?: (typeof PARTNER_STATUSES)[number];
}

export class PartnerStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'REJECTED']) status: 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CampaignReviewDto {
  @IsIn(['APPROVE', 'REJECT', 'PAUSE', 'RESUME', 'END']) action: 'APPROVE' | 'REJECT' | 'PAUSE' | 'RESUME' | 'END';
  /** APPROVE only: change the per-pass rate (rupees). Locked once approved. */
  @IsOptional() @Matches(RUPEES, { message: 'rate must be an amount like 0.50' }) rate?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
