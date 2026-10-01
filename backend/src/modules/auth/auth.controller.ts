import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { ApplyDto, ChangePasswordDto, LoginDto, RegisterDto } from './auth.dto';
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
