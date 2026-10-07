import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { SearchPageQuery } from '../../common/http';
import { MAX_STALLS_PER_BOOKING, STALL_CATEGORIES, STALL_GST_PERCENTS } from './stalls.rules';

const up = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value));
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const RUPEES = /^\d{1,7}(\.\d{1,2})?$/;
type Category = (typeof STALL_CATEGORIES)[number];

/** Public vendor signup: a login (User) + an ACTIVE Vendor, usable once the email is verified. */
export class VendorSignupDto {
  @IsString() @Length(2, 120) businessName: string;
  @IsString() @Length(2, 100) contactName: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsString() @Length(8, 128) password: string;
  @IsOptional() @IsIn(STALL_CATEGORIES) category?: Category;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @up() @Matches(GSTIN, { message: 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5' }) gstin?: string;
}

export class UpdateVendorDto {
  @IsOptional() @IsString() @Length(2, 120) businessName?: string;
  @IsOptional() @IsString() @Length(2, 100) contactName?: string;
  @IsOptional() @IsString() @Length(10, 20) contactPhone?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(STALL_CATEGORIES) category?: Category | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(80) city?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @up() @Matches(GSTIN, { message: 'GSTIN must be 15 characters, e.g. 27AAACT1234A1Z5' }) gstin?: string | null;
}

export class CreateStallTypeDto {
  @IsString() @Length(1, 80) name: string;
  @IsIn(STALL_CATEGORIES) category: Category;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(40) size?: string | null;
  @Matches(RUPEES, { message: 'price must be an amount like 5000 or 4999.50' }) price: string;
  @IsInt() @Min(0) @Max(10000) totalCount: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateStallTypeDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(STALL_CATEGORIES) category?: Category;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(40) size?: string | null;
  @IsOptional() @Matches(RUPEES, { message: 'price must be an amount like 5000 or 4999.50' }) price?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10000) totalCount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class StallSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  /** GST on stall rent when the festival has GST on (%). */
  @IsOptional() @IsIn(STALL_GST_PERCENTS) gstPercent?: (typeof STALL_GST_PERCENTS)[number];
}

export class CreateStallBookingDto {
  @IsUUID() stallTypeId: string;
  @IsInt() @Min(1) @Max(MAX_STALLS_PER_BOOKING) quantity: number;
  @IsString() @Length(2, 120) businessName: string;
  @IsString() @Length(2, 100) contactName: string;
  @IsString() @Length(10, 20) contactPhone: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsEmail() @MaxLength(200) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(500) products?: string;
}

export class StallPayDto {
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

export const BOOKING_STATUSES = ['PENDING', 'PAID', 'FAILED', 'EXPIRED'] as const;

export class StallBookingListQuery extends SearchPageQuery {
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: (typeof BOOKING_STATUSES)[number];
  @IsOptional() @IsUUID() stallTypeId?: string;
}

export class UpdateStallBookingDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(200) stallNumbers?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(500) mandalNote?: string | null;
}

export class VendorFestivalQuery extends SearchPageQuery {
  @IsOptional() @IsString() @MaxLength(80) city?: string;
}

export class VendorBookingQuery extends SearchPageQuery {
  @IsOptional() @IsIn(BOOKING_STATUSES) status?: (typeof BOOKING_STATUSES)[number];
}

export class AdminVendorQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class VendorStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
