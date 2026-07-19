import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StoreAccessService } from '../common/services/store-access.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsAdminService } from './locations-admin.service';

@Controller('locations')
@UseGuards(JwtAuthGuard)
export class LocationsAdminController {
  constructor(
    private readonly locationsService: LocationsAdminService,
    private readonly storeAccess: StoreAccessService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('brand') brand?: string,
  ) {
    if (!brand) {
      throw new BadRequestException('brand query parameter is required');
    }
    await this.storeAccess.assertCanManageStore(user, brand);
    return this.locationsService.list(brand);
  }

  @Post()
  async create(
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.storeAccess.assertCanManageStore(user, dto.brandSlug);
    return this.locationsService.create(dto, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const brandSlug = await this.locationsService.findBrandSlugForLocation(id);
    if (!brandSlug) {
      throw new NotFoundException('Location not found.');
    }
    await this.storeAccess.assertCanManageStore(user, brandSlug);
    return this.locationsService.update(id, dto, user);
  }
}
