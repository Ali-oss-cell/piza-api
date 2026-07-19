import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { StoreAccessService } from '../common/services/store-access.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandsService } from './brands.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreStatusDto } from './dto/update-store-status.dto';

@Controller('brands')
export class BrandsController {
  constructor(
    private readonly brandsService: BrandsService,
    private readonly storeAccess: StoreAccessService,
  ) {}

  @Get('resolve')
  resolveStore(
    @Query('path') path?: string,
    @Query('pathPrefix') pathPrefix?: string,
    @Query('host') host?: string,
  ) {
    return this.brandsService.resolveStore({
      pathPrefix: pathPrefix ?? path,
      host,
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.storeAccess.listAccessibleBrands(user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  createStore(
    @Body() dto: CreateStoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.brandsService.createStore(dto, user.id);
  }

  @Patch(':slug/status')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  updateStatus(
    @Param('slug') slug: string,
    @Body() dto: UpdateStoreStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.brandsService.updateStoreStatus(slug, dto.isActive, user.id);
  }

  @Get(':slug/domains')
  @UseGuards(JwtAuthGuard)
  async listDomains(
    @Param('slug') slug: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.storeAccess.assertCanManageStore(user, slug);
    return this.brandsService.listDomains(slug);
  }
}
