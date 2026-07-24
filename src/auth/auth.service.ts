import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { StoreMembershipRole, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthResponseDto, AuthStoreDto, AuthUserDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
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

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const user = await this.usersService.createUser(dto);
    return this.buildAuthResponse(user);
  }

  async getProfile(userId: string): Promise<AuthUserDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.toAuthUser(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: await this.toAuthUser(user),
    };
  }

  private async toAuthUser(user: User): Promise<AuthUserDto> {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      stores: await this.listAccessibleStores(user),
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
