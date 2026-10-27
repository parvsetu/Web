import { Transform } from 'class-transformer';
import { RULE_TARGETS, RuleTarget } from '../../common/pricing';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

const amount = ({ value }: { value: unknown }) => (value === undefined || value === null ? value : String(value).trim());

/**
 * kind DATES needs `dates`; WEEKENDS means every Saturday and Sunday of the event.
 * Exactly one of `fixedPrice` (rupees per person) or `upliftPercent` (e.g. 20 = +20%).
 */
export class CreatePriceRuleDto {
  @IsString() @Length(1, 60) label: string;
  @IsIn(['DATES', 'WEEKENDS']) kind: 'DATES' | 'WEEKENDS';
  @IsOptional() @IsArray() @ArrayMaxSize(366) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'dates must be YYYY-MM-DD' }) dates?: string[];
  /** SLOTS (default, day passes), TICKETS (programme tickets) or BOTH. */
  @IsOptional() @IsIn(RULE_TARGETS) appliesTo?: RuleTarget;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) timeSlotIds?: string[];
  /** Ticketed programme items the rule prices (empty = all of them). */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) programmeItemIds?: string[];
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(amount)
  @Matches(/^\d{1,6}(\.\d{1,2})?$/, { message: 'fixedPrice must be an amount like 150 or 99.50' }) fixedPrice?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000) upliftPercent?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePriceRuleDto {
  @IsOptional() @IsString() @Length(1, 60) label?: string;
  @IsOptional() @IsIn(['DATES', 'WEEKENDS']) kind?: 'DATES' | 'WEEKENDS';
  @IsOptional() @IsArray() @ArrayMaxSize(366) @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: 'dates must be YYYY-MM-DD' }) dates?: string[];
  /** SLOTS (default, day passes), TICKETS (programme tickets) or BOTH. */
  @IsOptional() @IsIn(RULE_TARGETS) appliesTo?: RuleTarget;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) timeSlotIds?: string[];
  /** Ticketed programme items the rule prices (empty = all of them). */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) programmeItemIds?: string[];
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Transform(amount)
  @Matches(/^\d{1,6}(\.\d{1,2})?$/, { message: 'fixedPrice must be an amount like 150 or 99.50' }) fixedPrice?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(1) @Max(1000) upliftPercent?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
