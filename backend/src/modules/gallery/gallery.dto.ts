import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PageQuery } from '../../common/http';

const bool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class PhotoListQuery extends PageQuery {
  /** true = only photos already published on the public site. */
  @IsOptional() @Transform(bool) @IsBoolean() public?: boolean;
}

export class OrgPhotoListQuery extends PhotoListQuery {
  @IsOptional() @IsUUID() eventId?: string;
}

/**
 * Text part of the multipart upload. `meta` is an optional JSON array, one
 * entry per file in order: [{ "caption": "...", "takenAt": "2026-10-03T19:20:00Z", "isPublic": false }].
 */
export class UploadPhotosDto {
  @IsOptional() @IsString() @MaxLength(20_000) meta?: string;
}

export class UpdatePhotoDto {
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class PhotoImageQuery {
  @IsOptional() @IsIn(['thumb', 'full']) size?: 'thumb' | 'full';
}
