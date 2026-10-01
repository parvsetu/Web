import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateVolunteerDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(8, 128) password?: string;
  @IsUUID() eventId: string;
  @IsOptional() @IsUUID() roleId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateVolunteerDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ApproveApplicationDto {
  @IsUUID() eventId: string;
  @IsUUID() roleId: string;
}

export class VolunteerListQuery {
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

export class ApplicationListQuery {
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}
