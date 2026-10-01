import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { PageQuery } from '../../common/http';

export class BookableEventsQuery {
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class AvailabilityQuery {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
}

export class CreatePassOrderDto {
  @IsUUID() eventId: string;
  @IsUUID() timeSlotId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsInt() @Min(1) @Max(100) visitorCount: number;
  @IsString() @Length(2, 100) buyerName: string;
  @IsString() @Length(10, 20) buyerMobile: string;
  @IsOptional() @IsEmail() @MaxLength(200) buyerEmail?: string;
}

export class OrderKeyQuery {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
}

export class DemoPayDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

export class PassOrderListQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'PAID', 'FAILED', 'EXPIRED']) status?: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
