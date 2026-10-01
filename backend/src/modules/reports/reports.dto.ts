import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { PageQuery } from '../../common/http';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQuery {
  @IsOptional() @Matches(YMD) from?: string;
  @IsOptional() @Matches(YMD) to?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() timeSlotId?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class DashboardQuery {
  @IsOptional() @Matches(YMD) date?: string;
  @IsOptional() @IsUUID() timeSlotId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

const RESULTS = ['SUCCESS', 'ALREADY_USED', 'EXPIRED', 'NOT_YET_VALID', 'CANCELLED', 'INVALID', 'WRONG_EVENT', 'UNAUTHORIZED'] as const;

export class ScanLogQuery extends PageQuery {
  @IsOptional() @IsIn(RESULTS) result?: (typeof RESULTS)[number];
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @Matches(YMD) date?: string;
  @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class MyScansQuery extends PageQuery {
  @IsUUID() eventId: string;
}
