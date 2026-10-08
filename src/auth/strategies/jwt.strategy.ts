import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/** Paths a PIN-login (POS-scoped) session may call, after the global prefix. */
const POS_SCOPE_PATH = /^\/[^/]+\/(pos\/|auth\/me$)/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthenticatedUser> {
    /* Manager-approval and other purpose tokens are not logins. */
    if (payload.type || payload.aud) {
      throw new UnauthorizedException('Invalid session');
    }

    if (payload.scope === 'pos') {
      if (!payload.storeId || !POS_SCOPE_PATH.test(req.path)) {
        throw new UnauthorizedException('POS session cannot access this.');
      }
      const membership = await this.prisma.userStore.findFirst({
        where: { userId: payload.sub, storeId: payload.storeId, isActive: true },
        select: { id: true },
      });
      if (!membership) {
        throw new UnauthorizedException('This account is turned off.');
      }
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      ...(payload.scope === 'pos'
        ? { scope: 'pos' as const, storeId: payload.storeId }
        : {}),
    };
  }
}
