import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
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
  SaveSeoRedirectDto,
  UpdateSeoContentDto,
  UpdateSeoGscSettingsDto,
  UpdateSeoImageDto,
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
      brandSlug ?? DEFAULT_BRAND_SLUG,
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Patch('content/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  updateContent(
    @Param('id') id: string,
    @Body() dto: UpdateSeoContentDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.seoService.updateContent(
      id,
      brandSlug ?? DEFAULT_BRAND_SLUG,
      dto,
    );
  }

  @Post('content/bulk')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  bulkUpsertContent(
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: BulkSeoContentDto,
  ) {
    return this.seoService.bulkUpsertContent(brandSlug ?? DEFAULT_BRAND_SLUG, dto);
  }

  @Get('domains')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  listDomains(@BrandSlug() brandSlug?: string) {
    return this.seoService.listDomains(brandSlug ?? DEFAULT_BRAND_SLUG);
  }

  @Get('images')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  listImages(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.listImages(
      brandSlug ?? DEFAULT_BRAND_SLUG,
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Patch('images/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  updateImage(
    @Param('id') id: string,
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: UpdateSeoImageDto,
  ) {
    return this.seoService.updateImage(id, brandSlug ?? DEFAULT_BRAND_SLUG, dto);
  }

  @Delete('images/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  deleteImage(@Param('id') id: string, @BrandSlug() brandSlug?: string) {
    return this.seoService.deleteImage(id, brandSlug ?? DEFAULT_BRAND_SLUG);
  }

  @Get('images/verify')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  verifyImages(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.verifyImages(
      brandSlug ?? DEFAULT_BRAND_SLUG,
      domainId === 'null' || domainId === '' ? null : domainId,
    );
  }

  @Get('redirects/resolve')
  resolveRedirect(@Query('host') host?: string, @Query('path') path?: string) {
    return this.seoService.resolveRedirect(host, path ?? '/');
  }

  @Get('redirects')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  listRedirects(@BrandSlug() brandSlug?: string) {
    return this.seoService.listRedirects(brandSlug ?? DEFAULT_BRAND_SLUG);
  }

  @Post('redirects')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  saveRedirect(
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: SaveSeoRedirectDto,
  ) {
    return this.seoService.saveRedirect(brandSlug ?? DEFAULT_BRAND_SLUG, dto);
  }

  @Delete('redirects/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  deleteRedirect(@Param('id') id: string, @BrandSlug() brandSlug?: string) {
    return this.seoService.deleteRedirect(id, brandSlug ?? DEFAULT_BRAND_SLUG);
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
    return this.seoService.saveBlogPost(brandSlug ?? DEFAULT_BRAND_SLUG, dto);
  }

  @Delete('blog/:id')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  deleteBlogPost(@Param('id') id: string, @BrandSlug() brandSlug?: string) {
    return this.seoService.deleteBlogPost(id, brandSlug ?? DEFAULT_BRAND_SLUG);
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

  @Get('launch-checklist')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  launchChecklist(
    @BrandSlug() brandSlug?: string,
    @Query('domainId') domainId?: string,
  ) {
    return this.seoService.getLaunchChecklist(
      brandSlug ?? DEFAULT_BRAND_SLUG,
      domainId === 'null' || domainId === '' ? null : domainId ?? null,
    );
  }

  @Patch('gsc-settings')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  updateGscSettings(
    @BrandSlug() brandSlug: string | undefined,
    @Body() dto: UpdateSeoGscSettingsDto,
  ) {
    return this.seoService.updateGscSettings(brandSlug ?? DEFAULT_BRAND_SLUG, dto);
  }

  @Post('fill-from-store')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  fillFromStore(
    @BrandSlug() brandSlug: string | undefined,
    @Body() body: { domainId?: string | null; overwrite?: boolean },
  ) {
    return this.seoService.fillFromStore(
      brandSlug ?? DEFAULT_BRAND_SLUG,
      body.domainId === undefined
        ? null
        : body.domainId === null
          ? null
          : body.domainId,
      { overwrite: body.overwrite === true },
    );
  }

  @Post('starter-blog')
  @UseGuards(JwtAuthGuard, SeoAccessGuard)
  starterBlog(
    @BrandSlug() brandSlug: string | undefined,
    @Body() body: { domainId?: string | null },
  ) {
    return this.seoService.ensureStarterBlog(
      brandSlug ?? DEFAULT_BRAND_SLUG,
      body.domainId ?? null,
    );
  }
}
