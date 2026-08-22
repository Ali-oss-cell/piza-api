import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { SeoAccessGuard } from '../common/guards/seo-access.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StoreAccessService } from '../common/services/store-access.service';
import {
  BulkSeoContentDto,
  SaveBlogPostDto,
  UpdateSeoContentDto,
} from './dto/seo.dto';
import { SeoService } from './seo.service';

@Controller('seo')
export class SeoController {
  constructor(
    private readonly seoService: SeoService,
    private readonly storeAccess: StoreAccessService,
  ) {}

  @Get('content')
  getPublicContent(
    @Query('brand') brand?: string,
    @Query('page') page?: string,
    @Query('domainId') domainId?: string,
    @Query('host') host?: string,
    @Query('path') path?: string,
  ) {
    return this.seoService.getMergedContent({
      brandSlug: brand,
      page,
      domainId,
      host,
      pathPrefix: path,
    });
  }

  @Get('content/admin')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  getAdminContent(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.getAdminContent(
      brandSlug ?? 'leovorno',
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Patch('content/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  updateContent(@Param('id') id: string, @Body() dto: UpdateSeoContentDto) {
    return this.seoService.updateContent(id, dto);
  }

  @Post('content/bulk')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  bulkUpsertContent(
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: BulkSeoContentDto,
  ) {
    return this.seoService.bulkUpsertContent(brandSlug ?? 'leovorno', dto);
  }

  @Get('domains')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  listDomains(@BrandSlug() brandSlug?: string) {
    return this.seoService.listDomains(brandSlug ?? 'leovorno');
  }

  @Get('images')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  listImages(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.listImages(
      brandSlug ?? 'leovorno',
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Delete('images/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  deleteImage(@Param('id') id: string, @BrandSlug() brandSlug?: string) {
    return this.seoService.deleteImage(id, brandSlug ?? 'leovorno');
  }

  @Get('images/verify')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  verifyImages(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.verifyImages(
      brandSlug ?? 'leovorno',
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Get('blog')
  @UseGuards(OptionalJwtAuthGuard)
  async listBlogPosts(
    @Query('brand') brand?: string,
    @Query('domainId') domainId?: string,
    @Query('host') host?: string,
    @Query('path') path?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const includeDrafts = user
      ? await this.storeAccess.canAccessSeoDashboard(user)
      : false;

    return this.seoService.listBlogPosts({
      brandSlug: brand,
      domainId,
      host,
      pathPrefix: path,
      includeDrafts,
    });
  }

  @Get('blog/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  async getBlogPost(
    @Param('slug') slug: string,
    @Query('brand') brand?: string,
    @Query('domainId') domainId?: string,
    @Query('host') host?: string,
    @Query('path') path?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const includeDrafts = user
      ? await this.storeAccess.canAccessSeoDashboard(user)
      : false;

    return this.seoService.getBlogPost({
      slug,
      brandSlug: brand,
      domainId,
      host,
      pathPrefix: path,
      includeDrafts,
    });
  }

  @Post('blog')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  saveBlogPost(
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: SaveBlogPostDto,
  ) {
    return this.seoService.saveBlogPost(brandSlug ?? 'leovorno', dto);
  }

  @Delete('blog/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  deleteBlogPost(
    @Param('id') id: string,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.seoService.deleteBlogPost(id, brandSlug ?? 'leovorno');
  }

  @Get('sitemap-data')
  getSitemapData(
    @Query('brand') brand?: string,
    @Query('domainId') domainId?: string,
    @Query('host') host?: string,
    @Query('path') path?: string,
    @Query('baseUrl') baseUrl?: string,
  ) {
    return this.seoService.getSitemapData({
      brandSlug: brand,
      domainId,
      host,
      pathPrefix: path,
      baseUrl: baseUrl ?? 'https://marinapizzas.com.au',
    });
  }

  @Get('robots')
  getRobots() {
    return this.seoService.getRobotsConfig();
  }
}
