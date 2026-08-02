import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('summary')
  getSummary(@BrandSlug() brandSlug?: string) {
    return this.inventoryService.getSummary(brandSlug);
  }

  @Get('items')
  listItems(
    @BrandSlug() brandSlug?: string,
    @Query('lowStock') lowStock?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.inventoryService.listItems(brandSlug, {
      lowStock: lowStock === 'true' || lowStock === '1',
      includeInactive:
        includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Post('items')
  createItem(
    @Body() dto: CreateStockItemDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.createItem(dto, brandSlug);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockItemDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.updateItem(id, dto, brandSlug);
  }

  @Delete('items/:id')
  deactivateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.deactivateItem(id, brandSlug);
  }

  @Get('items/:id/movements')
  listMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
    @Query('take') take?: string,
  ) {
    return this.inventoryService.listMovements(
      id,
      brandSlug,
      take ? Number(take) : undefined,
    );
  }

  @Post('items/:id/movements')
  createMovement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.createMovement(id, dto, user.id, brandSlug);
  }
}
