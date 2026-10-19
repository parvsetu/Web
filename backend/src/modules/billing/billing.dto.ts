import { IsIn, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';
import { PageQuery } from '../../common/http';
import { PASS_PRINT_FORMATS, PassPrintSetting } from './billing.service';

const RUPEES = /^\d{1,8}(\.\d{1,2})?$/;
const PERCENT = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

export class PlatformSettingsDto {
  @IsOptional() @Matches(RUPEES, { message: 'defaultTokenPrice must be an amount like 100 or 99.50' }) defaultTokenPrice?: string;
  @IsOptional() @Matches(PERCENT, { message: 'defaultCommissionPercent must be 0–100 with up to 2 decimals' }) defaultCommissionPercent?: string;
  @IsOptional() @Matches(RUPEES) lowCreditThreshold?: string;
  @IsOptional() @Matches(RUPEES) welcomeCredit?: string;
  /** Default promotional-partner rate per printed pass (paid by the partner). */
  @IsOptional() @Matches(RUPEES) partnerRate?: string;
  /** Pass layout for mandals without an override (AUTO = A4 with 2+ ads, else thermal 80 mm). */
  @IsOptional() @IsIn(PASS_PRINT_FORMATS) defaultPassPrintFormat?: PassPrintSetting;
  /** Gateway fee taken from the mandal's share of online payments (%). */
  @IsOptional() @Matches(PERCENT) gatewayFeePercent?: string;
  /** Default yearly fee for a mandal landing page (/m/<slug>). */
  @IsOptional() @Matches(RUPEES) landingPageYearlyPrice?: string;
  /** Default registration fee per event (each event pays separately). */
  @IsOptional() @Matches(RUPEES) defaultEventFee?: string;
  /** Field-agent referral: fixed amount per mandal (earned on its first paid event fee). */
  @IsOptional() @Matches(RUPEES) agentReferralFee?: string;
  /** Field-agent commission on every paid event fee (%). */
  @IsOptional() @Matches(PERCENT) agentCommissionPercent?: string;
  /** Platform fee on vendor stall bookings (% of the rent before GST). */
  @IsOptional() @Matches(PERCENT) stallCommissionPercent?: string;
  @IsOptional() @Matches(PERCENT) competitionCommissionPercent?: string;
  /** Blogger referral commission on a paid pass booking: PERCENT of the ex-GST ticket value, or FIXED ₹ per booking. Send with referralCommissionValue. */
  @IsOptional() @IsIn(['PERCENT', 'FIXED']) referralCommissionMode?: 'PERCENT' | 'FIXED';
  /** % (0–100) for PERCENT, ₹ for FIXED. */
  @IsOptional() @IsString() @Length(1, 12) referralCommissionValue?: string;
  /** 80G: cash donations above this (₹) get no deduction. CA review. */
  @IsOptional() @Matches(RUPEES) tax80GCashLimit?: string;
  /** Form 10BD / 10BE due date after the financial year, MM-DD. CA review. */
  @IsOptional() @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'due date looks like 05-31' }) tax10BDDueMonthDay?: string;
}

/** Per-mandal overrides; send null to fall back to the platform default. */
export class MandalPricingDto {
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) tokenPrice?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PERCENT) commissionPercent?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) lowCreditThreshold?: string | null;
  /** Partner rate per pass at this mandal. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) partnerRate?: string | null;
  /** Pass print layout — only the super admin sets it. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(PASS_PRINT_FORMATS) passPrintFormat?: PassPrintSetting | null;
  /** Landing page yearly fee at this mandal. */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) landingPagePrice?: string | null;
  /** Per-event registration fee at this mandal (beats the festival-type and default fee). */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(RUPEES) eventFee?: string | null;
  /** Platform fee on this mandal's stall bookings (%). */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(PERCENT) stallCommissionPercent?: string | null;
}

export class AdjustCreditDto {
  /** Signed rupees, e.g. "500" or "-50". */
  @Matches(/^-?\d{1,8}(\.\d{1,2})?$/) amount: string;
  @IsString() @Length(3, 300) reason: string;
}

export class RechargeDto {
  @Matches(RUPEES, { message: 'Enter an amount like 1000' }) amount: string;
}

export class RechargeResultDto {
  @IsIn(['success', 'fail']) outcome: 'success' | 'fail';
}

export class CreditTxQuery extends PageQuery {
  @IsOptional() @IsIn(['RECHARGE', 'TOKEN_FEE', 'REFUND', 'ADJUSTMENT', 'WELCOME']) type?: string;
  @IsOptional() @IsIn(['DESK', 'BULK', 'ONLINE', 'DONATION']) source?: string;
  @IsOptional() @IsString() organizationId?: string;
}

export class MandalBillingQuery extends PageQuery {
  @IsOptional() @IsIn(['OK', 'LOW', 'EXHAUSTED']) state?: string;
  @IsOptional() @IsString() q?: string;
}
