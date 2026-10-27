import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const MONEY = /^\d{1,8}(\.\d{1,2})?$/;

/** Cancel a paid booking. refund omitted = all of it for unused passes (pro rata when some were used). */
export class CancelPassOrderDto {
  @IsString() @Length(5, 500) reason: string;
  @IsOptional() @Matches(MONEY, { message: 'refund must be an amount like 250' }) refund?: string;
  /** Gateway refund id / UPI / UTR, if the refund was already sent. */
  @IsOptional() @IsString() @MaxLength(200) refundReference?: string;
}

export class MarkRefundedDto {
  @IsString() @Length(3, 200) refundReference: string;
}
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
  /** Exactly one of timeSlotId (day pass) / programmeItemId (ticket for one programme). */
  @IsOptional() @IsUUID() timeSlotId?: string;
  @IsOptional() @IsUUID() programmeItemId?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsInt() @Min(1) @Max(100) visitorCount: number;
  @IsString() @Length(2, 100) buyerName: string;
  @IsString() @Length(10, 20) buyerMobile: string;
  @IsOptional() @IsEmail() @MaxLength(200) buyerEmail?: string;
  /** true (default): one QR per person; false: one group QR. */
  @IsOptional() @IsBoolean() perPersonPasses?: boolean;
  /** Blogger referral code (from a /f/<event>?ref=CODE link or typed). An unknown code is ignored, never an error. */
  @IsOptional() @IsString() @MaxLength(40) referralCode?: string;
}

export class OrderKeyQuery {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
}

export class DemoPayDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{20,64}$/) k: string;
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

export class PassOrderListQuery extends PageQuery {
  @IsOptional() @IsIn(['PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED']) status?: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  /** Cancelled bookings whose refund still has to be sent. */
  @IsOptional() @IsIn(['true', 'false']) refundToSend?: 'true' | 'false';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
