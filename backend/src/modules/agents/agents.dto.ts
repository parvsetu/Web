import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateIf } from 'class-validator';
import { PageQuery, SearchPageQuery } from '../../common/http';

const RUPEES = /^\d{1,8}(\.\d{1,2})?$/;
const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

export class CreateAgentDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Length(10, 20) phone: string;
  @IsEmail() @MaxLength(200) email: string;
  /** Referral code; generated from the name when omitted. */
  @IsOptional() @Matches(/^[A-Za-z0-9]{4,12}$/, { message: 'code must be 4–12 letters or digits' }) code?: string;
  @IsOptional() @Matches(RUPEES) referralFee?: string;
  @IsOptional() @Matches(PERCENT) commissionPercent?: string;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
  /** null = platform default. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) referralFee?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PERCENT) commissionPercent?: string | null;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AgentPayoutDto {
  @Matches(/^(?!0+(\.0+)?$)\d{1,8}(\.\d{1,2})?$/, { message: 'amount must be a positive amount like 500' }) amount: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) paidOn: string;
  @IsString() @Length(2, 200) reference: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AttributeAgentDto {
  /** null removes the attribution. */
  @ValidateIf((_o, v) => v !== null) @IsUUID() agentId: string | null;
  @IsString() @Length(3, 500) reason: string;
}

export class AgentListQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class AgentMandalQuery extends SearchPageQuery {
  @IsOptional() @IsIn(['PENDING_VERIFICATION', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED']) status?: string;
}

export { PageQuery };
