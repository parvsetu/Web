import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PageQuery, SearchPageQuery } from '../../common/http';
import { REFERRAL_CODE_RE } from './referral-rules';

export const RUPEES = /^\d{1,8}(\.\d{1,2})?$/;
export const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;
const HANDLE = /^@?[A-Za-z0-9._]{1,30}$/;
const url = { protocols: ['http', 'https'], require_protocol: true };
const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

class ChannelFields {
  @IsOptional() @ValidateIf((_o, v) => v !== '') @trim() @IsUrl(url, { message: 'YouTube link must start with https://' }) @MaxLength(300) youtubeUrl?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @trim() @Matches(HANDLE, { message: 'Instagram handle looks like @yourname' }) instagramHandle?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @trim() @IsUrl(url, { message: 'Blog link must start with https://' }) @MaxLength(300) blogUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) audience?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(1000) bio?: string;
}

export class BloggerSignupDto extends ChannelFields {
  @IsString() @Length(2, 100) name: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsString() @Length(8, 128) password: string;
  /** Festivals to promote (each one is approved separately). */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ArrayUnique() @IsUUID('all', { each: true }) eventIds: string[];
}

export class UpdateBloggerProfileDto extends ChannelFields {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsString() @Length(10, 20) phone?: string;
}

export class RequestPromotionDto {
  @IsUUID() eventId: string;
}

export class BloggerStatusDto {
  /** ACTIVE approves (or re-activates) the blogger. */
  @IsIn(['ACTIVE', 'REJECTED', 'SUSPENDED']) status: 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class CommissionFields {
  /** DEFAULT = platform default; PERCENT takes a %; FIXED takes ₹ per booking. */
  @IsOptional() @IsIn(['DEFAULT', 'PERCENT', 'FIXED']) commissionMode?: 'DEFAULT' | 'PERCENT' | 'FIXED';
  /** % for PERCENT (0–100), ₹ for FIXED; checked against the mode in the service (parseCommission). */
  @IsOptional() @IsString() @MaxLength(12) commissionValue?: string;
}

export class ReviewPromotionDto extends CommissionFields {
  @IsIn(['APPROVE', 'REJECT', 'REVOKE']) decision: 'APPROVE' | 'REJECT' | 'REVOKE';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** Optional custom referral code at approval (generated otherwise). */
  @IsOptional() @Matches(REFERRAL_CODE_RE, { message: 'code must be 4–20 letters or digits' }) code?: string;
}

export class PromotionCommissionDto {
  @IsIn(['DEFAULT', 'PERCENT', 'FIXED']) commissionMode: 'DEFAULT' | 'PERCENT' | 'FIXED';
  @IsOptional() @IsString() @MaxLength(12) commissionValue?: string;
}

export class BloggerPayoutDto {
  @Matches(/^(?!0+(\.0+)?$)\d{1,8}(\.\d{1,2})?$/, { message: 'amount must be a positive amount like 500' }) amount: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) paidOn: string;
  @IsString() @Length(2, 200) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ReverseEntryDto {
  @IsString() @Length(5, 500) reason: string;
}

export class BloggerListQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED']) status?: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
}

export class PromotionListQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
}

export class ReferralReportQuery {
  @IsOptional() @IsUUID() bloggerId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class ReferralCodeQuery {
  @Matches(REFERRAL_CODE_RE) code: string;
}

export { PageQuery };
