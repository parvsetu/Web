import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString() @Length(2, 100) name: string;
  @IsString() @Length(10, 20) mobile: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsString() @Length(8, 128) password: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class LoginDto {
  @IsString() @Length(3, 200) identifier: string;
  @IsString() @Length(1, 128) password: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(8, 128) newPassword: string;
}

export class ApplyDto {
  @IsUUID() organizationId: string;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional() @IsString() @MaxLength(500) message?: string;
}
