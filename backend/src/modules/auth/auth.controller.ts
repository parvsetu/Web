import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { ApplyDto, ChangePasswordDto, CodeOnlyDto, EmailOnlyDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyEmailDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/resend-verification')
  @HttpCode(200)
  resend(@Body() dto: EmailOnlyDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/forgot-password')
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/reset-password')
  @HttpCode(204)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('auth/me/email/send-code')
  @HttpCode(200)
  sendMyCode(@CurrentUser() user: RequestUser) {
    return this.auth.sendMyVerification(user);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/me/email/verify')
  @HttpCode(200)
  verifyMine(@CurrentUser() user: RequestUser, @Body() dto: CodeOnlyDto) {
    return this.auth.verifyMyEmail(user, dto.code);
  }

  @Get('auth/me')
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user);
  }

  @Post('auth/change-password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: RequestUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user, dto);
  }

  @Post('volunteer-applications')
  apply(@CurrentUser() user: RequestUser, @Body() dto: ApplyDto) {
    return this.auth.apply(user, dto);
  }

  @Get('me/applications')
  myApplications(@CurrentUser() user: RequestUser) {
    return this.auth.myApplications(user);
  }
}
