import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { BrandsService } from './brands.service';
import { CreateStoreDto } from './dto/create-store.dto';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.brandsService.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createStore(@Body() dto: CreateStoreDto) {
    return this.brandsService.createStore(dto);
  }
}
