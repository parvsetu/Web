import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PageQuery } from '../../common/http';

export class InstagramCallbackDto {
  @IsString() @Length(4, 2000) code: string;
  @IsString() @Length(10, 1000) state: string;
}

export class InstagramMediaQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export class InstagramIdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @IsUUID('all', { each: true }) ids: string[];
}

export class InstagramDisconnectDto {
  /** Also delete the photos already approved for the landing page. */
  @IsOptional() @IsBoolean() removePhotos?: boolean;
}

/** Meta's deauthorize / data-deletion callbacks post a form field `signed_request`. */
export class SignedRequestDto {
  @IsOptional() @IsString() signed_request?: string;
}
