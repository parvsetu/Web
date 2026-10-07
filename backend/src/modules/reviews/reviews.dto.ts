import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/http';
import { MAX_DISPLAY_NAME, MAX_REVIEW_TEXT, REPORT_REASONS, ReportReason } from './reviews.rules';

const toInt = ({ value }: { value: unknown }) => (typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value);
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const KEY = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Text part of the multipart review form (files go in `files`, thumbnails in `thumbs`).
 * Everything arrives as strings, hence the transforms.
 */
export class SubmitReviewDto {
  @IsString() @Matches(KEY) k: string;
  @Transform(toInt) @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(MAX_REVIEW_TEXT + 50) text?: string;
  @IsString() @Length(1, MAX_DISPLAY_NAME + 10) displayName: string;
  /** Must be "true": the visitor ticked the consent box. */
  @Transform(toBool) @IsBoolean() consent: boolean;
  /** Edit only: JSON array of existing photo ids to keep (others are deleted). */
  @IsOptional() @IsString() @MaxLength(500) keepPhotoIds?: string;
}

export class ReviewKeyQuery {
  @IsString() @Matches(KEY) k: string;
}

export class ReviewPhotoImageQuery {
  @IsOptional() @IsIn(['thumb', 'full']) size?: 'thumb' | 'full';
}

export class OwnReviewPhotoQuery extends ReviewPhotoImageQuery {
  @IsString() @Matches(KEY) k: string;
}

export class ReportReviewDto {
  @IsIn(REPORT_REASONS) reason: ReportReason;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN'] as const;

export class ReviewListQuery extends PageQuery {
  @IsOptional() @IsIn(REVIEW_STATUSES) status?: (typeof REVIEW_STATUSES)[number];
  @IsOptional() @Transform(toBool) @IsBoolean() flagged?: boolean;
  /** Mandal-level list only: one festival. */
  @IsOptional() @IsUUID() eventId?: string;
}

export class ModerateNoteDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export class ApproveReviewDto extends ModerateNoteDto {
  /** Photos to publish with the review; omitted = every photo still on it. Others stay unpublished. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsUUID('all', { each: true }) photoIds?: string[];
}

export class FeatureReviewDto {
  @IsBoolean() featured: boolean;
}

export class ReviewPhotoUpdateDto {
  @IsBoolean() approved: boolean;
}

export class PlatformRemoveReviewDto {
  @IsString() @Length(3, 300) reason: string;
}

export class PublicReviewsQuery extends PageQuery {}
