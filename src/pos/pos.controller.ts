import {
  Body,
  Controller,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { CardPaymentDto, CashPaymentDto } from './dto/payment.dto';
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
  ) {
    return this.posService.createOrder(dto, staff);
  }

  @Get('orders/active')
  findActiveOrders() {
    return this.posService.findActiveOrders();
  }

  @Get('orders/lookup')
  lookupOrder(
    @Query('id') id?: string,
    @Query('ticketNumber', new ParseIntPipe({ optional: true }))
    ticketNumber?: number,
  ) {
    return this.posService.lookupOrder({ id, ticketNumber });
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePosOrderStatusDto,
  ) {
    return this.posService.updateStatus(id, dto.status);
  }

  @Post('payments/card')
  startCardPayment(@Body() dto: CardPaymentDto) {
    return this.posService.startCardPayment(dto.orderId, dto.readerId);
  }

  @Get('payments/:orderId/status')
  getPaymentStatus(@Param('orderId') orderId: string) {
    return this.posService.getPaymentStatus(orderId);
  }

  @Post('payments/cash')
  markCashPaid(@Body() dto: CashPaymentDto) {
    return this.posService.markCashPaid(dto.orderId);
  }
}
