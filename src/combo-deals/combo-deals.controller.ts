import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ComboDealsService } from './combo-deals.service';
import { CreateComboDealDto } from './dto/create-combo-deal.dto';
import { UpdateComboDealDto } from './dto/update-combo-deal.dto';

@Controller('combo-deals')
export class ComboDealsController {
  constructor(private readonly comboDealsService: ComboDealsService) {}

  @Get()
  findActive(@BrandSlug() brandSlug?: string) {
    return this.comboDealsService.findActive(brandSlug);
  }

  @Get('manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllForAdmin(@BrandSlug() brandSlug?: string) {
    return this.comboDealsService.findAllForAdmin(brandSlug);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.comboDealsService.findOne(id, brandSlug);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateComboDealDto, @BrandSlug() brandSlug?: string) {
    return this.comboDealsService.create(dto, brandSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComboDealDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.comboDealsService.update(id, dto, brandSlug);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.comboDealsService.remove(id, brandSlug);
  }
}
