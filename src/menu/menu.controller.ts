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
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuService } from './menu.service';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  findAll(@BrandSlug() brandSlug?: string) {
    return this.menuService.findAll(brandSlug);
  }

  @Get('categories')
  findAllCategories(@BrandSlug() brandSlug?: string) {
    return this.menuService.findAllCategories(brandSlug);
  }

  @Get('categories/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllCategoriesForAdmin(@BrandSlug() brandSlug?: string) {
    return this.menuService.findAllCategoriesForAdmin(brandSlug);
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createCategory(
    @Body() dto: CreateMenuCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.menuService.createCategory(dto, brandSlug);
  }

  @Put('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCategory(
    @Param('slug') slug: string,
    @Body() dto: UpdateMenuCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.menuService.updateCategory(slug, dto, brandSlug);
  }

  @Delete('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCategory(@Param('slug') slug: string, @BrandSlug() brandSlug?: string) {
    return this.menuService.removeCategory(slug, brandSlug);
  }

  @Get('manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllForAdmin(@BrandSlug() brandSlug?: string) {
    return this.menuService.findAllForAdmin(brandSlug);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @BrandSlug() brandSlug?: string) {
    return this.menuService.findBySlug(slug, brandSlug);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.menuService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateMenuItemDto, @BrandSlug() brandSlug?: string) {
    return this.menuService.create(dto, brandSlug);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.menuService.update(id, dto, brandSlug);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @BrandSlug() brandSlug?: string) {
    return this.menuService.remove(id, brandSlug);
  }
}
