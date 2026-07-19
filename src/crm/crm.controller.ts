import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { CrmService } from './crm.service';
import { CreateCustomerSegmentDto } from './dto/create-customer-segment.dto';
import { CreateCustomerTagDto } from './dto/create-customer-tag.dto';
import { UpdateCustomerSegmentDto } from './dto/update-customer-segment.dto';
import { UpdateStoreCustomerDto } from './dto/update-store-customer.dto';

@Controller('hq/crm')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post('backfill')
  backfill(@Query('brand') brand?: string) {
    if (brand) {
      return this.crmService.backfillBrand(brand);
    }
    return this.crmService.backfillAll();
  }

  @Get('customers')
  listCustomers(
    @Query('brand') brand?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('segment') segment?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    return this.crmService.listCustomers({
      brandSlug: brand,
      q,
      tag,
      segmentId: segment,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('customers/:id')
  getCustomer(@Param('id', ParseUUIDPipe) id: string) {
    return this.crmService.getCustomer(id);
  }

  @Patch('customers/:id')
  updateCustomer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStoreCustomerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.crmService.updateCustomer(id, dto, user);
  }

  @Get('tags')
  listTags(@Query('brand') brand?: string) {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    return this.crmService.listTags(brand);
  }

  @Post('tags')
  createTag(
    @Query('brand') brand: string | undefined,
    @Body() dto: CreateCustomerTagDto,
  ) {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    return this.crmService.createTag(brand, dto);
  }

  @Delete('tags/:id')
  deleteTag(@Param('id', ParseUUIDPipe) id: string) {
    return this.crmService.deleteTag(id);
  }

  @Get('segments')
  listSegments(@Query('brand') brand?: string) {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    return this.crmService.listSegments(brand);
  }

  @Post('segments')
  createSegment(
    @Query('brand') brand: string | undefined,
    @Body() dto: CreateCustomerSegmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    return this.crmService.createSegment(brand, dto, user);
  }

  @Patch('segments/:id')
  updateSegment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerSegmentDto,
  ) {
    return this.crmService.updateSegment(id, dto);
  }

  @Delete('segments/:id')
  deleteSegment(@Param('id', ParseUUIDPipe) id: string) {
    return this.crmService.deleteSegment(id);
  }

  @Get('segments/:id/members')
  segmentMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.crmService.listSegmentMembers(
      id,
      take ? Number(take) : undefined,
      skip ? Number(skip) : undefined,
    );
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('brand') brand?: string,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('segment') segment?: string,
  ): Promise<string> {
    if (!brand?.trim()) {
      throw new BadRequestException('brand query parameter is required');
    }
    const csv = await this.crmService.exportCsv(
      { brandSlug: brand, q, tag, segmentId: segment },
      user,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="crm-${brand}.csv"`,
    );
    return csv;
  }
}
