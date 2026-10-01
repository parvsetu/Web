import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { SearchPageQuery } from '../../common/http';
import { FESTIVAL_TYPES } from '../../common/festival-types';

const FESTIVAL_KEYS = FESTIVAL_TYPES.map((f) => f.key);

export class CreateOrganizationDto {
  @IsString() @Length(2, 150) name: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9-]{2,60}$/) slug?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
}

export class UpdateOrganizationDto {
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsIn(FESTIVAL_KEYS, { each: true }) festivalTypes?: string[];
}

export class AddMemberDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(8, 128) password?: string;
  @IsUUID() roleId: string;
}

export class UpdateMemberDto {
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateRoleDto {
  @IsString() @Length(2, 80) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) permissions: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(2, 80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) permissions?: string[];
}

export class OrgListQuery extends SearchPageQuery {
  @IsOptional() @IsString() @MaxLength(80) state?: string;
}

export class AuditQuery extends SearchPageQuery {
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsString() @Type(() => String) @MaxLength(80) action?: string;
}
