import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { BulkCreateStockItemsDto } from './dto/bulk-create-stock-items.dto';
import {
  CreateStockMovementDto,
  ReplaceRecipeDto,
} from './dto/create-stock-movement.dto';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { InventoryPurchasingService } from './inventory-purchasing.service';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly purchasingService: InventoryPurchasingService,
  ) {}

  @Get('summary')
  getSummary(@BrandSlug() brandSlug?: string) {
    return this.inventoryService.getSummary(brandSlug);
  }

  @Get('stats')
  getStats(
    @BrandSlug() brandSlug?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.inventoryService.getStats(brandSlug, from, to);
  }

  @Get('movements')
  listBrandMovements(
    @BrandSlug() brandSlug?: string,
    @Query('take') take?: string,
    @Query('type') type?: string,
    @Query('stockItemId') stockItemId?: string,
  ) {
    return this.inventoryService.listBrandMovements(brandSlug, {
      take: take ? Number(take) : undefined,
      type,
      stockItemId,
    });
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

  @Post('items/bulk')
  createItemsBulk(
    @Body() dto: BulkCreateStockItemsDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.createItemsBulk(dto.items, brandSlug);
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

  @Get('recipes')
  listRecipes(@BrandSlug() brandSlug?: string) {
    return this.inventoryService.listRecipes(brandSlug);
  }

  @Get('recipes/toppings')
  listToppingRecipes(@BrandSlug() brandSlug?: string) {
    return this.inventoryService.listToppingRecipes(brandSlug);
  }

  @Put('recipes/toppings/:toppingId')
  replaceToppingRecipe(
    @Param('toppingId', ParseUUIDPipe) toppingId: string,
    @Body() dto: ReplaceRecipeDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.replaceToppingRecipe(
      toppingId,
      dto,
      brandSlug,
    );
  }

  @Get('recipes/crusts')
  listCrustRecipes(@BrandSlug() brandSlug?: string) {
    return this.inventoryService.listCrustRecipes(brandSlug);
  }

  @Put('recipes/crusts/:crustOptionId')
  replaceCrustRecipe(
    @Param('crustOptionId', ParseUUIDPipe) crustOptionId: string,
    @Body() dto: ReplaceRecipeDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.replaceCrustRecipe(
      crustOptionId,
      dto,
      brandSlug,
    );
  }

  @Put('recipes/:menuItemId')
  replaceRecipe(
    @Param('menuItemId', ParseUUIDPipe) menuItemId: string,
    @Body() dto: ReplaceRecipeDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.inventoryService.replaceRecipe(menuItemId, dto, brandSlug);
  }

  @Get('suppliers')
  listSuppliers(
    @BrandSlug() brandSlug?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.purchasingService.listSuppliers(brandSlug, {
      includeInactive:
        includeInactive === 'true' || includeInactive === '1',
    });
  }

  @Post('suppliers')
  createSupplier(
    @Body() dto: CreateSupplierDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.createSupplier(dto, brandSlug);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.updateSupplier(id, dto, brandSlug);
  }

  @Get('purchase-orders')
  listPurchaseOrders(@BrandSlug() brandSlug?: string) {
    return this.purchasingService.listPurchaseOrders(brandSlug);
  }

  @Post('purchase-orders')
  createPurchaseOrder(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.createPurchaseOrder(
      dto,
      user.id,
      brandSlug,
    );
  }

  @Get('purchase-orders/:id')
  getPurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.getPurchaseOrder(id, brandSlug);
  }

  @Patch('purchase-orders/:id')
  updatePurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.updatePurchaseOrder(id, dto, brandSlug);
  }

  @Post('purchase-orders/:id/send')
  sendPurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.sendPurchaseOrder(id, brandSlug);
  }

  @Post('purchase-orders/:id/cancel')
  cancelPurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.cancelPurchaseOrder(id, brandSlug);
  }

  @Post('purchase-orders/:id/receive')
  receivePurchaseOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.purchasingService.receivePurchaseOrder(
      id,
      dto,
      user.id,
      brandSlug,
    );
  }

  @Get('purchase-orders/:id/pdf')
  @Header('Content-Type', 'application/pdf')
  async getPurchaseOrderPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @BrandSlug() brandSlug?: string,
  ): Promise<Buffer> {
    const pdf = await this.purchasingService.buildPdf(id, brandSlug);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="purchase-order-${id}.pdf"`,
    );
    return pdf;
  }
}
