import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { LocationId } from '../common/decorators/location-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import {
  CardPaymentDto,
  CashPaymentDto,
  LinklySettlementDto,
  RefundCardPaymentDto,
} from './dto/payment.dto';
import {
  AddFavouriteDto,
  CashRefundDto,
  ChangePosPinDto,
  CloseShiftDto,
  EscPosPrintDto,
  OpenShiftDto,
  SetPosPinDto,
  ToggleTrainingDto,
  UpdatePrinterSettingsDto,
  VerifyPosPinDto,
  VoidOrderDto,
} from './dto/pos-ops.dto';
import { UpdatePosOrderStatusDto } from './dto/update-pos-order-status.dto';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STAFF)
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('orders/quote')
  quote(@Body() dto: QuoteRequestDto) {
    return this.posService.quote(dto);
  }

  @Post('orders')
  createOrder(
    @Body() dto: CreatePosOrderDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.createOrder(dto, staff, brandSlug, locationId);
  }

  @Get('orders/active')
  findActiveOrders(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.findActiveOrders(staff, brandSlug, locationId);
  }

  @Get('orders/lookup')
  lookupOrder(
    @CurrentUser() staff: AuthenticatedUser,
    @Query('id') id?: string,
    @Query('ticketNumber', new ParseIntPipe({ optional: true }))
    ticketNumber?: number,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.lookupOrder(staff, {
      id,
      ticketNumber,
      brandSlug,
      locationId,
    });
  }

  @Get('orders/by-phone')
  findByPhone(
    @CurrentUser() staff: AuthenticatedUser,
    @Query('phone') phone: string,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.findOrdersByPhone(
      phone,
      staff,
      brandSlug,
      locationId,
    );
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePosOrderStatusDto,
  ) {
    return this.posService.updateStatus(id, dto.status);
  }

  @Post('orders/:id/void')
  voidOrder(
    @Param('id') id: string,
    @Body() dto: VoidOrderDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.voidUnpaidOrder(
      id,
      dto.reason,
      dto.managerActionToken,
      staff,
    );
  }

  @Get('payment-methods')
  getPaymentMethods(
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.getPaymentMethods(brandSlug, locationId);
  }

  @Get('settings')
  getSettings(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.getLocationPosSettings(staff, brandSlug, locationId);
  }

  @Patch('settings/printers')
  updatePrinters(
    @Body() dto: UpdatePrinterSettingsDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.updatePrinterSettings(
      staff,
      brandSlug,
      locationId,
      dto,
    );
  }

  @Post('settings/training')
  toggleTraining(
    @Body() dto: ToggleTrainingDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.toggleTraining(
      dto.enabled,
      dto.managerActionToken,
      staff,
      brandSlug,
      locationId,
    );
  }

  @Post('auth/verify-pin')
  verifyPin(
    @Body() dto: VerifyPosPinDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.verifyPin(dto.pin, staff);
  }

  @Post('auth/change-pin')
  changePin(
    @Body() dto: ChangePosPinDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.changeOwnPin(dto.currentPin, dto.newPin, staff);
  }

  @Post('auth/set-pin')
  setPin(
    @Body() dto: SetPosPinDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.setPin(dto.userId, dto.pin, staff);
  }

  @Get('auth/staff')
  listStaff(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.posService.listStaffForPin(staff, brandSlug);
  }

  @Get('favourites')
  listFavourites(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.listFavourites(staff, brandSlug, locationId);
  }

  @Post('favourites')
  addFavourite(
    @Body() dto: AddFavouriteDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.addFavourite(
      dto.menuItemId,
      staff,
      brandSlug,
      locationId,
    );
  }

  @Delete('favourites/:menuItemId')
  removeFavourite(
    @Param('menuItemId') menuItemId: string,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.removeFavourite(
      menuItemId,
      staff,
      brandSlug,
      locationId,
    );
  }

  @Get('shifts/current')
  currentShift(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService
      .getLocationPosSettings(staff, brandSlug, locationId)
      .then((s) => s.openShift);
  }

  @Post('shifts/open')
  openShift(
    @Body() dto: OpenShiftDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.openShift(
      staff,
      brandSlug,
      locationId,
      dto.openingFloat ?? 0,
      dto.registerId,
    );
  }

  @Get('shifts/:id/report')
  shiftReport(@Param('id') id: string) {
    return this.posService.getShiftReport(id);
  }

  @Post('shifts/:id/close')
  closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.closeShift(id, dto.closingCountedCash, staff);
  }

  @Post('print/escpos')
  printEscPos(
    @Body() dto: EscPosPrintDto,
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.printEscPos(
      staff,
      brandSlug,
      locationId,
      dto.target,
      dto.text,
    );
  }

  @Post('payments/card')
  startCardPayment(
    @Body() dto: CardPaymentDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.startCardPayment(
      dto.orderId,
      dto.readerId,
      staff,
      dto.inventoryOverrideReason,
    );
  }

  @Get('payments/unresolved')
  findUnresolvedCardPayments(
    @CurrentUser() staff: AuthenticatedUser,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.findUnresolvedCardPayments(
      staff,
      brandSlug,
      locationId,
    );
  }

  @Get('payments/:orderId/status')
  getPaymentStatus(@Param('orderId') orderId: string) {
    return this.posService.getPaymentStatus(orderId);
  }

  @Post('payments/:orderId/linkly-recover')
  recoverLinklyPayment(@Param('orderId') orderId: string) {
    return this.posService.recoverLinklyPayment(orderId);
  }

  @Post('payments/refund')
  refundCardPayment(
    @Body() dto: RefundCardPaymentDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.refundCardPayment(
      dto.orderId,
      staff,
      dto.amountCents,
    );
  }

  @Post('payments/refund-cash')
  refundCash(
    @Body() dto: CashRefundDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.cashRefund(
      dto.orderId,
      dto.reason,
      dto.managerActionToken,
      staff,
      dto.amount,
    );
  }

  @Post('linkly/settlement')
  runLinklySettlement(
    @Body() dto: LinklySettlementDto,
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.posService.runLinklySettlement(
      brandSlug,
      dto.settlementType ?? 'S',
      locationId,
    );
  }

  @Post('payments/cash')
  markCashPaid(
    @Body() dto: CashPaymentDto,
    @CurrentUser() staff: AuthenticatedUser,
  ) {
    return this.posService.markCashPaid(
      dto.orderId,
      staff,
      dto.inventoryOverrideReason,
    );
  }
}
