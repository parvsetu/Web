import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PageQuery } from '../../common/http';

const MONEY = /^\d{1,8}(\.\d{1,2})?$/;
const CM = /^\d{1,4}(\.\d)?$/;

export class CreateArtworkDto {
  @IsString() @Length(1, 140) title: string;
  @IsString() @Length(2, 100) artistName: string;
  @IsOptional() @IsString() @MaxLength(600) artistBio?: string;
  @IsOptional() @IsString() @MaxLength(200) artistInstagram?: string;
  @IsOptional() @IsString() @MaxLength(80) medium?: string;
  /** Centimetres, e.g. "60" or "45.5"; empty clears. */
  @IsOptional() @ValidateIf((_o, v) => v !== '' && v !== null) @Matches(CM, { message: 'width must be in cm, e.g. 60 or 45.5' }) widthCm?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== '' && v !== null) @Matches(CM, { message: 'height must be in cm, e.g. 60 or 45.5' }) heightCm?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== '' && v !== null) @Matches(CM, { message: 'depth must be in cm, e.g. 10' }) depthCm?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1800) @Max(2100) year?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsIn(['DISPLAY', 'SALE']) mode?: 'DISPLAY' | 'SALE';
  /** Rupees (SALE only). */
  @IsOptional() @ValidateIf((_o, v) => v !== '' && v !== null) @Matches(MONEY, { message: 'price must be an amount like 15000' }) price?: string | null;
  @IsOptional() @IsIn(['AVAILABLE', 'RESERVED', 'SOLD']) saleStatus?: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isPublished?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(10000) sortOrder?: number;
}

export class UpdateArtworkDto extends CreateArtworkDto {
  @IsOptional() @IsString() @Length(1, 140) declare title: string;
  @IsOptional() @IsString() @Length(2, 100) declare artistName: string;
}

export class EnquiryListQuery extends PageQuery {
  @IsOptional() @IsIn(['NEW', 'CONTACTED', 'CLOSED']) status?: 'NEW' | 'CONTACTED' | 'CLOSED';
}

export class UpdateEnquiryDto {
  @IsIn(['NEW', 'CONTACTED', 'CLOSED']) status: 'NEW' | 'CONTACTED' | 'CLOSED';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class CreateEnquiryDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @MaxLength(20) phone: string;
  @IsOptional() @ValidateIf((_o, v) => v !== '') @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  /** Honeypot: real people leave it empty. */
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class ArtImageQuery {
  @IsOptional() @IsIn(['thumb', 'full']) size?: 'thumb' | 'full';
  /** Cache-buster (image updatedAt); ignored. */
  @IsOptional() @IsString() @MaxLength(20) v?: string;
}
