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
import { CustomizationsService } from './customizations.service';
import { CreateCrustOptionDto } from './dto/create-crust-option.dto';
import { CreateIngredientCategoryDto } from './dto/create-ingredient-category.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateToppingCategoryDto } from './dto/create-topping-category.dto';
import { CreateToppingDto } from './dto/create-topping.dto';
import { UpdateCrustOptionDto } from './dto/update-crust-option.dto';
import { UpdateIngredientCategoryDto } from './dto/update-ingredient-category.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdateToppingCategoryDto } from './dto/update-topping-category.dto';
import { UpdateToppingDto } from './dto/update-topping.dto';

@Controller('customizations')
export class CustomizationsController {
  constructor(private readonly customizationsService: CustomizationsService) {}

  @Get('toppings')
  async findActiveToppings(@BrandSlug() brandSlug?: string) {
    const toppings = await this.customizationsService.findActiveToppings(brandSlug);
    return this.customizationsService.groupToppings(toppings);
  }

  @Get('toppings/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllToppings(@BrandSlug() brandSlug?: string) {
    const toppings = await this.customizationsService.findAllToppings(brandSlug);
    return this.customizationsService.groupToppings(toppings);
  }

  @Post('toppings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createTopping(@Body() dto: CreateToppingDto, @BrandSlug() brandSlug?: string) {
    return this.customizationsService.createTopping(dto, brandSlug);
  }

  @Put('toppings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateTopping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateToppingDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.updateTopping(id, dto, brandSlug);
  }

  @Delete('toppings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeTopping(@Param('id', ParseUUIDPipe) id: string) {
    return this.customizationsService.removeTopping(id);
  }

  @Get('categories/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllCategories(@BrandSlug() brandSlug?: string) {
    return this.customizationsService.findAllCategories(brandSlug);
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createCategory(
    @Body() dto: CreateToppingCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.createCategory(dto, brandSlug);
  }

  @Put('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCategory(
    @Param('slug') slug: string,
    @Body() dto: UpdateToppingCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.updateCategory(slug, dto, brandSlug);
  }

  @Delete('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCategory(@Param('slug') slug: string, @BrandSlug() brandSlug?: string) {
    return this.customizationsService.removeCategory(slug, brandSlug);
  }

  @Get('crusts')
  findActiveCrusts(@BrandSlug() brandSlug?: string) {
    return this.customizationsService.findActiveCrusts(brandSlug);
  }

  @Get('crusts/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllCrusts(@BrandSlug() brandSlug?: string) {
    return this.customizationsService.findAllCrusts(brandSlug);
  }

  @Post('crusts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createCrust(@Body() dto: CreateCrustOptionDto, @BrandSlug() brandSlug?: string) {
    return this.customizationsService.createCrust(dto, brandSlug);
  }

  @Put('crusts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCrust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCrustOptionDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.updateCrust(id, dto, brandSlug);
  }

  @Delete('crusts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCrust(@Param('id', ParseUUIDPipe) id: string) {
    return this.customizationsService.removeCrust(id);
  }

  @Get('ingredients')
  async findActiveIngredients(@BrandSlug() brandSlug?: string) {
    const ingredients = await this.customizationsService.findActiveIngredients(brandSlug);
    return this.customizationsService.groupIngredients(ingredients);
  }

  @Get('ingredients/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllIngredients(@BrandSlug() brandSlug?: string) {
    const ingredients = await this.customizationsService.findAllIngredients(brandSlug);
    return this.customizationsService.groupIngredients(ingredients);
  }

  @Post('ingredients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createIngredient(@Body() dto: CreateIngredientDto, @BrandSlug() brandSlug?: string) {
    return this.customizationsService.createIngredient(dto, brandSlug);
  }

  @Put('ingredients/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateIngredient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.updateIngredient(id, dto, brandSlug);
  }

  @Delete('ingredients/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeIngredient(@Param('id', ParseUUIDPipe) id: string) {
    return this.customizationsService.removeIngredient(id);
  }

  @Get('ingredient-categories/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllIngredientCategories(@BrandSlug() brandSlug?: string) {
    return this.customizationsService.findAllIngredientCategories(brandSlug);
  }

  @Post('ingredient-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createIngredientCategory(
    @Body() dto: CreateIngredientCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.createIngredientCategory(dto, brandSlug);
  }

  @Put('ingredient-categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateIngredientCategory(
    @Param('slug') slug: string,
    @Body() dto: UpdateIngredientCategoryDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.updateIngredientCategory(slug, dto, brandSlug);
  }

  @Delete('ingredient-categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeIngredientCategory(
    @Param('slug') slug: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.customizationsService.removeIngredientCategory(slug, brandSlug);
  }
}
