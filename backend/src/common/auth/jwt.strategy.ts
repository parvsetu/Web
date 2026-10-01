import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from './request-user';

interface JwtPayload {
  sub: string;
  ver: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  // Re-read the user on every request: a disabled user or a bumped
  // tokenVersion (password change / disable) revokes the JWT immediately.
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, isSuperAdmin: true, status: true, tokenVersion: true, partnerId: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Session expired. Please log in again.');
    }
    return { id: user.id, name: user.name, isSuperAdmin: user.isSuperAdmin, partnerId: user.partnerId };
  }
}
