import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { StoreMembershipRole, User, UserRole } from '@prisma/client';
import { findUsersByPosCode } from '../common/pos-code';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, AuthStoreDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/** bcrypt(cost 12) of a random throwaway string; never matches anything. */
const DUMMY_PASSWORD_HASH =
  '$2b$12$HXonFP9Pg74jboAjqG84YOCvH3vnbBOafSyt2eB8qQFRZb9wmwy4O';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      /* Same bcrypt cost as a real check so response time doesn't reveal which emails exist. */
      await this.usersService.validatePassword(dto.password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await this.usersService.validatePassword(
      dto.password,
      user.password,
    );

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async loginWithPosCode(
    code: string,
    storeSlug: string,
  ): Promise<AuthResponseDto> {
    const store = await this.prisma.brand.findFirst({
      where: { slug: storeSlug, isActive: true },
      select: { id: true },
    });
    if (!store) {
      throw new UnauthorizedException('That code is not recognised.');
    }

    const matches = await findUsersByPosCode(this.prisma, code, store.id);
    if (matches.length !== 1) {
      /* Same message for "no match" and "shared code" so the endpoint is not a PIN oracle. */
      throw new UnauthorizedException('That code is not recognised.');
    }

    const user = matches[0]!;
    if (user.role !== UserRole.MANAGER && user.role !== UserRole.STAFF) {
      throw new UnauthorizedException('This code cannot open the register.');
    }

    return this.buildAuthResponse(user, { scope: 'pos', storeId: store.id });
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.createUser(dto);
    return this.buildAuthResponse(user);
  }

  /** `posStoreId` set = PIN session: only that store is offered. */
  async getProfile(userId: string, posStoreId?: string): Promise<AuthUserDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toAuthUser(user, posStoreId);
  }

  private async buildAuthResponse(
    user: User,
    pos?: { scope: 'pos'; storeId: string },
  ): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      ...pos,
    };

    return {
      accessToken: this.jwtService.sign(
        payload,
        pos ? { expiresIn: '12h' } : undefined,
      ),
      user: await this.toAuthUser(user, pos?.storeId),
    };
  }

  private async toAuthUser(
    user: User,
    posStoreId?: string,
  ): Promise<AuthUserDto> {
    const stores = await this.listAccessibleStores(user);
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      posPinMustChange: user.posPinMustChange,
      stores: posStoreId
        ? stores.filter((store) => store.id === posStoreId)
        : stores,
    };
  }

  private async listAccessibleStores(user: User): Promise<AuthStoreDto[]> {
    if (user.role === UserRole.ADMIN) {
      const brands = await this.prisma.brand.findMany({
        where: { isActive: true },
        include: {
          locations: {
            where: { isActive: true },
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          },
        },
        orderBy: { name: 'asc' },
      });

      return brands.map((brand) => ({
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        tagline: brand.tagline,
        primaryColor: brand.primaryColor,
        membershipRole: StoreMembershipRole.PLATFORM_ADMIN,
        locations: brand.locations.map((location) => ({
          id: location.id,
          slug: location.slug,
          name: location.name,
          isDefault: location.isDefault,
        })),
      }));
    }

    const memberships = await this.prisma.userStore.findMany({
      where: { userId: user.id, isActive: true },
      include: {
        store: {
          include: {
            locations: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships
      .filter((membership) => membership.store.isActive)
      .map((membership) => {
        const locations = membership.locationId
          ? membership.store.locations.filter(
              (location) => location.id === membership.locationId,
            )
          : membership.store.locations;

        return {
          id: membership.store.id,
          slug: membership.store.slug,
          name: membership.store.name,
          tagline: membership.store.tagline,
          primaryColor: membership.store.primaryColor,
          membershipRole: membership.role,
          locations: locations.map((location) => ({
            id: location.id,
            slug: location.slug,
            name: location.name,
            isDefault: location.isDefault,
          })),
        };
      });
  }
}
