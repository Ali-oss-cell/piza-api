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
  async findActiveToppings() {
    const toppings = await this.customizationsService.findActiveToppings();
    return this.customizationsService.groupToppings(toppings);
  }

  @Get('toppings/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllToppings() {
    const toppings = await this.customizationsService.findAllToppings();
    return this.customizationsService.groupToppings(toppings);
  }

  @Post('toppings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createTopping(@Body() dto: CreateToppingDto) {
    return this.customizationsService.createTopping(dto);
  }

  @Put('toppings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateTopping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateToppingDto,
  ) {
    return this.customizationsService.updateTopping(id, dto);
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
  findAllCategories() {
    return this.customizationsService.findAllCategories();
  }

  @Post('categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: CreateToppingCategoryDto) {
    return this.customizationsService.createCategory(dto);
  }

  @Put('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCategory(
    @Param('slug') slug: string,
    @Body() dto: UpdateToppingCategoryDto,
  ) {
    return this.customizationsService.updateCategory(slug, dto);
  }

  @Delete('categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCategory(@Param('slug') slug: string) {
    return this.customizationsService.removeCategory(slug);
  }

  @Get('crusts')
  findActiveCrusts() {
    return this.customizationsService.findActiveCrusts();
  }

  @Get('crusts/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAllCrusts() {
    return this.customizationsService.findAllCrusts();
  }

  @Post('crusts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createCrust(@Body() dto: CreateCrustOptionDto) {
    return this.customizationsService.createCrust(dto);
  }

  @Put('crusts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateCrust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCrustOptionDto,
  ) {
    return this.customizationsService.updateCrust(id, dto);
  }

  @Delete('crusts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeCrust(@Param('id', ParseUUIDPipe) id: string) {
    return this.customizationsService.removeCrust(id);
  }

  @Get('ingredients')
  async findActiveIngredients() {
    const ingredients = await this.customizationsService.findActiveIngredients();
    return this.customizationsService.groupIngredients(ingredients);
  }

  @Get('ingredients/manage/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAllIngredients() {
    const ingredients = await this.customizationsService.findAllIngredients();
    return this.customizationsService.groupIngredients(ingredients);
  }

  @Post('ingredients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createIngredient(@Body() dto: CreateIngredientDto) {
    return this.customizationsService.createIngredient(dto);
  }

  @Put('ingredients/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateIngredient(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIngredientDto,
  ) {
    return this.customizationsService.updateIngredient(id, dto);
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
  findAllIngredientCategories() {
    return this.customizationsService.findAllIngredientCategories();
  }

  @Post('ingredient-categories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  createIngredientCategory(@Body() dto: CreateIngredientCategoryDto) {
    return this.customizationsService.createIngredientCategory(dto);
  }

  @Put('ingredient-categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateIngredientCategory(
    @Param('slug') slug: string,
    @Body() dto: UpdateIngredientCategoryDto,
  ) {
    return this.customizationsService.updateIngredientCategory(slug, dto);
  }

  @Delete('ingredient-categories/:slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  removeIngredientCategory(@Param('slug') slug: string) {
    return this.customizationsService.removeIngredientCategory(slug);
  }
}
