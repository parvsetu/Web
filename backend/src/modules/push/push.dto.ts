import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString() @Length(16, 200) p256dh: string;
  @IsString() @Length(8, 100) auth: string;
}

/** What the browser's PushManager.subscribe() returns (subscription.toJSON()), plus the site language. */
export class PushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
  @IsOptional() @IsIn(['en', 'hi', 'mr', 'bn', 'or', 'kn']) lang?: string;
}

export class PassPushDto {
  @ValidateNested() @Type(() => PushSubscriptionDto) subscription: PushSubscriptionDto;
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
}

export class EndpointDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) endpoint: string;
}
