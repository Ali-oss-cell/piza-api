import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { ApplyMenuTemplateDto } from './dto/apply-menu-template.dto';
import { CreateDomainDto } from './dto/create-domain.dto';
import { CreateMenuTemplateDto } from './dto/create-menu-template.dto';
import { PushDealDto } from './dto/push-deal.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';
import { HqService } from './hq.service';

@Controller('hq')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class HqController {
  constructor(private readonly hqService: HqService) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.hqService.getOverview(user, from, to);
  }

  @Get('reports/sales')
  salesReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('brand') brand?: string,
  ) {
    return this.hqService.getSalesReport(user, from, to, brand);
  }

  @Get('reports/sales.csv')
  @Header('Content-Type', 'text/csv')
  async salesReportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('brand') brand?: string,
  ): Promise<string> {
    const csv = await this.hqService.getSalesReportCsv(user, from, to, brand);
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="hq-sales.csv"',
    );
    return csv;
  }

  @Get('onboarding/:brandSlug')
  onboarding(@Param('brandSlug') brandSlug: string) {
    return this.hqService.getOnboarding(brandSlug);
  }

  @Get('customers')
  customers(
    @CurrentUser() user: AuthenticatedUser,
    @Query('q') query?: string,
    @Query('brand') brand?: string,
  ) {
    return this.hqService.getCustomers(user, query, brand);
  }

  @Get('customers/:key/orders')
  customerOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Query('brand') brand?: string,
  ) {
    return this.hqService.getCustomerOrders(user, key, brand);
  }

  @Get('activity')
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('store') store?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.hqService.getActivity(
      user,
      store,
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Get('domains')
  domains() {
    return this.hqService.listDomains();
  }

  @Post('domains')
  createDomain(
    @Body() dto: CreateDomainDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hqService.createDomain(dto, user);
  }

  @Patch('domains/:id')
  updateDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDomainDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hqService.updateDomain(id, dto, user);
  }

  @Get('menu-templates')
  menuTemplates() {
    return this.hqService.listMenuTemplates();
  }

  @Post('menu-templates')
  createMenuTemplate(
    @Body() dto: CreateMenuTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hqService.createMenuTemplate(dto, user);
  }

  @Post('menu-templates/:id/apply')
  applyMenuTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyMenuTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hqService.applyMenuTemplate(id, dto, user);
  }

  @Post('deals/:dealId/push')
  pushDeal(
    @Param('dealId', ParseUUIDPipe) dealId: string,
    @Body() dto: PushDealDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hqService.pushDeal(dealId, dto, user);
  }
}
