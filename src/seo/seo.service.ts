import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlogPostStatus, SeoContent } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { BrandsService } from '../brands/brands.service';
import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkSeoContentDto,
  SaveBlogPostDto,
  SaveSeoRedirectDto,
  UpdateSeoContentDto,
  UpdateSeoGscSettingsDto,
  UpdateSeoImageDto,
} from './dto/seo.dto';

export type SeoContentResponse = {
  sections: Record<string, string>;
  meta: {
    title?: string;
    description?: string;
    keywords?: string;
    ogImageUrl?: string;
    robotsIndex: boolean;
  };
  rows: SeoContent[];
};

@Injectable()
export class SeoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  /** Live posts only: published and not scheduled for the future. */
  private publicBlogWhere() {
    const now = new Date();
    return {
      status: BlogPostStatus.PUBLISHED,
      OR: [{ publishedAt: null }, { publishedAt: { lte: now } }],
    };
  }

  async resolveStoreId(brandSlug?: string): Promise<string> {
    const slug = (brandSlug ?? DEFAULT_BRAND_SLUG).trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }
    return brand.id;
  }

  async resolveContext(params: {
    brandSlug?: string;
    host?: string;
    pathPrefix?: string;
    domainId?: string;
  }): Promise<{ storeId: string; domainId: string | null; brandSlug: string }> {
    if (params.domainId) {
      const domain = await this.prisma.storeDomain.findUnique({
        where: { id: params.domainId },
        include: { store: true },
      });
      if (!domain || !domain.isActive) {
        throw new NotFoundException('Domain not found.');
      }
      return {
        storeId: domain.storeId,
        domainId: domain.id,
        brandSlug: domain.store.slug,
      };
    }

    if (params.host || params.pathPrefix) {
      const store = await this.brandsService.resolveStore({
        host: params.host,
        pathPrefix: params.pathPrefix,
      });
      const domain = await this.prisma.storeDomain.findFirst({
        where: {
          storeId: store.id,
          isActive: true,
          ...(params.host
            ? { host: params.host.trim().toLowerCase() }
            : { pathPrefix: params.pathPrefix }),
        },
      });
      return {
        storeId: store.id,
        domainId: domain?.id ?? null,
        brandSlug: store.slug,
      };
    }

    const storeId = await this.resolveStoreId(params.brandSlug);
    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: storeId },
    });
    return {
      storeId,
      domainId: null,
      brandSlug: brand.slug,
    };
  }

  private mergeContentRows(
    storeDefaults: SeoContent[],
    domainOverrides: SeoContent[],
  ): SeoContent[] {
    const merged = new Map<string, SeoContent>();
    for (const row of storeDefaults) {
      merged.set(`${row.page}:${row.section}`, row);
    }
    for (const row of domainOverrides) {
      merged.set(`${row.page}:${row.section}`, row);
    }
    return Array.from(merged.values());
  }

  private toContentResponse(rows: SeoContent[], page?: string): SeoContentResponse {
    const filtered = page ? rows.filter((row) => row.page === page) : rows;
    const sections: Record<string, string> = {};
    let meta = {
      title: undefined as string | undefined,
      description: undefined as string | undefined,
      keywords: undefined as string | undefined,
      ogImageUrl: undefined as string | undefined,
      robotsIndex: true,
    };

    for (const row of filtered) {
      sections[row.section] = row.content;
      if (row.section === 'page_title') {
        meta = {
          title: row.metaTitle ?? row.content ?? meta.title,
          description: row.metaDescription ?? meta.description,
          keywords: row.metaKeywords ?? meta.keywords,
          ogImageUrl: row.ogImageUrl ?? meta.ogImageUrl,
          robotsIndex: row.robotsIndex,
        };
      }
    }

    return { sections, meta, rows: filtered };
  }

  async getMergedContent(params: {
    brandSlug?: string;
    host?: string;
    pathPrefix?: string;
    domainId?: string;
    page?: string;
  }): Promise<SeoContentResponse> {
    const ctx = await this.resolveContext(params);
    const pageFilter = params.page ? { page: params.page } : {};

    const storeDefaults = await this.prisma.seoContent.findMany({
      where: {
        storeId: ctx.storeId,
        domainId: null,
        ...pageFilter,
      },
    });

    let domainOverrides: SeoContent[] = [];
    if (ctx.domainId) {
      domainOverrides = await this.prisma.seoContent.findMany({
        where: {
          storeId: ctx.storeId,
          domainId: ctx.domainId,
          ...pageFilter,
        },
      });
    }

    const merged = this.mergeContentRows(storeDefaults, domainOverrides);
    return this.toContentResponse(merged, params.page);
  }

  async getAdminContent(
    brandSlug: string,
    domainId?: string | null,
  ): Promise<SeoContent[]> {
    const storeId = await this.resolveStoreId(brandSlug);
    const normalizedDomainId = domainId ?? null;

    return this.prisma.seoContent.findMany({
      where: {
        storeId,
        domainId: normalizedDomainId,
      },
      orderBy: [{ page: 'asc' }, { section: 'asc' }],
    });
  }

  async updateContent(id: string, dto: UpdateSeoContentDto): Promise<SeoContent> {
    const existing = await this.prisma.seoContent.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('SEO content row not found.');
    }

    return this.prisma.seoContent.update({
      where: { id },
      data: {
        content: dto.content,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords,
        ogImageUrl: dto.ogImageUrl,
        robotsIndex: dto.robotsIndex,
      },
    });
  }

  async bulkUpsertContent(
    brandSlug: string,
    dto: BulkSeoContentDto,
  ): Promise<SeoContent[]> {
    const storeId = await this.resolveStoreId(brandSlug);
    const domainId = dto.domainId ?? null;
    const results: SeoContent[] = [];

    for (const item of dto.items) {
      const existing = await this.prisma.seoContent.findFirst({
        where: {
          storeId,
          domainId,
          page: item.page,
          section: item.section,
        },
      });

      if (existing) {
        results.push(
          await this.prisma.seoContent.update({
            where: { id: existing.id },
            data: {
              content: item.content ?? existing.content,
              metaTitle: item.metaTitle ?? existing.metaTitle,
              metaDescription: item.metaDescription ?? existing.metaDescription,
              metaKeywords: item.metaKeywords ?? existing.metaKeywords,
              ogImageUrl: item.ogImageUrl ?? existing.ogImageUrl,
              robotsIndex: item.robotsIndex ?? existing.robotsIndex,
            },
          }),
        );
      } else {
        results.push(
          await this.prisma.seoContent.create({
            data: {
              storeId,
              domainId,
              page: item.page,
              section: item.section,
              content: item.content ?? '',
              metaTitle: item.metaTitle,
              metaDescription: item.metaDescription,
              metaKeywords: item.metaKeywords,
              ogImageUrl: item.ogImageUrl,
              robotsIndex: item.robotsIndex ?? true,
            },
          }),
        );
      }
    }

    return results;
  }

  async listDomains(brandSlug: string) {
    const storeId = await this.resolveStoreId(brandSlug);
    return this.prisma.storeDomain.findMany({
      where: { storeId, isActive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async listImages(brandSlug: string, domainId?: string | null) {
    const storeId = await this.resolveStoreId(brandSlug);
    const images = await this.prisma.seoImage.findMany({
      where: {
        storeId,
        domainId: domainId ?? null,
      },
      orderBy: { createdAt: 'desc' },
    });

    const paths = images.map((image) => image.filePath);
    const contentUses =
      paths.length === 0
        ? []
        : await this.prisma.seoContent.findMany({
            where: { storeId, content: { in: paths } },
            select: { page: true, section: true, content: true },
          });
    const thumbUses = await this.prisma.blogPost.findMany({
      where: {
        storeId,
        thumbnailImageId: { in: images.map((image) => image.id) },
      },
      select: { id: true, slug: true, title: true, thumbnailImageId: true },
    });

    return images.map((image) => {
      const usedInPages = contentUses
        .filter((row) => row.content === image.filePath)
        .map((row) => `${row.page}/${row.section}`);
      const usedInPosts = thumbUses
        .filter((post) => post.thumbnailImageId === image.id)
        .map((post) => `blog:${post.slug}`);
      return {
        ...image,
        usage: [...usedInPages, ...usedInPosts],
      };
    });
  }

  async updateImage(id: string, brandSlug: string, dto: UpdateSeoImageDto) {
    const storeId = await this.resolveStoreId(brandSlug);
    const image = await this.prisma.seoImage.findFirst({
      where: { id, storeId },
    });
    if (!image) {
      throw new NotFoundException('Image not found.');
    }

    return this.prisma.seoImage.update({
      where: { id },
      data: {
        label: dto.label === undefined ? undefined : dto.label,
        altText: dto.altText === undefined ? undefined : dto.altText,
        page: dto.page === undefined ? undefined : dto.page,
        section: dto.section === undefined ? undefined : dto.section,
      },
    });
  }

  async createImageRecord(params: {
    brandSlug: string;
    domainId?: string | null;
    filename: string;
    filePath: string;
    label?: string;
    page?: string;
    section?: string;
    altText?: string;
  }) {
    const storeId = await this.resolveStoreId(params.brandSlug);
    return this.prisma.seoImage.create({
      data: {
        storeId,
        domainId: params.domainId ?? null,
        filename: params.filename,
        filePath: params.filePath,
        label: params.label,
        page: params.page,
        section: params.section,
        altText: params.altText,
      },
    });
  }

  async deleteImage(id: string, brandSlug: string) {
    const storeId = await this.resolveStoreId(brandSlug);
    const image = await this.prisma.seoImage.findFirst({
      where: { id, storeId },
    });
    if (!image) {
      throw new NotFoundException('Image not found.');
    }

    const diskPath = join(process.cwd(), 'uploads', 'seo', image.filename);
    if (existsSync(diskPath)) {
      unlinkSync(diskPath);
    }

    await this.prisma.seoImage.delete({ where: { id } });
    return { success: true };
  }

  async verifyImages(brandSlug: string, domainId?: string | null) {
    const images = await this.listImages(brandSlug, domainId);
    const missing = images.filter((image) => {
      const diskPath = join(process.cwd(), 'uploads', 'seo', image.filename);
      return !existsSync(diskPath);
    });
    return { missing, total: images.length };
  }

  async listBlogPosts(params: {
    brandSlug?: string;
    host?: string;
    pathPrefix?: string;
    domainId?: string;
    includeDrafts?: boolean;
  }) {
    const ctx = await this.resolveContext(params);
    const statusFilter = params.includeDrafts
      ? undefined
      : this.publicBlogWhere();

    const storePosts = await this.prisma.blogPost.findMany({
      where: {
        storeId: ctx.storeId,
        domainId: null,
        ...statusFilter,
      },
      include: { thumbnail: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!ctx.domainId) {
      return storePosts;
    }

    const domainPosts = await this.prisma.blogPost.findMany({
      where: {
        storeId: ctx.storeId,
        domainId: ctx.domainId,
        ...statusFilter,
      },
      include: { thumbnail: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const bySlug = new Map<string, (typeof storePosts)[number]>();
    for (const post of storePosts) {
      bySlug.set(post.slug, post);
    }
    for (const post of domainPosts) {
      bySlug.set(post.slug, post);
    }

    return Array.from(bySlug.values()).sort((a, b) => {
      const aDate = a.publishedAt ?? a.createdAt;
      const bDate = b.publishedAt ?? b.createdAt;
      return bDate.getTime() - aDate.getTime();
    });
  }

  async getBlogPost(params: {
    slug: string;
    brandSlug?: string;
    host?: string;
    pathPrefix?: string;
    domainId?: string;
    includeDrafts?: boolean;
  }) {
    const ctx = await this.resolveContext(params);
    const visibility = params.includeDrafts ? {} : this.publicBlogWhere();

    if (ctx.domainId) {
      const domainPost = await this.prisma.blogPost.findFirst({
        where: {
          storeId: ctx.storeId,
          domainId: ctx.domainId,
          slug: params.slug,
          ...visibility,
        },
        include: { thumbnail: true },
      });
      if (domainPost) {
        return domainPost;
      }
    }

    const storePost = await this.prisma.blogPost.findFirst({
      where: {
        storeId: ctx.storeId,
        domainId: null,
        slug: params.slug,
        ...visibility,
      },
      include: { thumbnail: true },
    });

    if (!storePost) {
      throw new NotFoundException('Blog post not found.');
    }

    return storePost;
  }

  async saveBlogPost(brandSlug: string, dto: SaveBlogPostDto) {
    const storeId = await this.resolveStoreId(brandSlug);
    const domainId = dto.domainId ?? null;
    const status =
      dto.status === 'PUBLISHED'
        ? BlogPostStatus.PUBLISHED
        : BlogPostStatus.DRAFT;

    const slug = dto.slug.trim().toLowerCase().replace(/\s+/g, '-');
    if (!slug) {
      throw new BadRequestException('Slug is required.');
    }

    let existingPublishedAt: Date | null = null;
    if (dto.id) {
      const existing = await this.prisma.blogPost.findFirst({
        where: { id: dto.id, storeId },
      });
      if (!existing) {
        throw new NotFoundException('Blog post not found.');
      }
      existingPublishedAt = existing.publishedAt;
    }

    let publishedAt: Date | null = null;
    if (status === BlogPostStatus.DRAFT) {
      publishedAt = null;
    } else if (dto.publishedAt) {
      publishedAt = new Date(dto.publishedAt);
    } else {
      publishedAt = existingPublishedAt ?? new Date();
    }

    if (dto.id) {
      return this.prisma.blogPost.update({
        where: { id: dto.id },
        data: {
          domainId,
          slug,
          title: dto.title,
          excerpt: dto.excerpt,
          content: dto.content ?? '',
          author: dto.author,
          status,
          publishedAt,
          thumbnailImageId: dto.thumbnailImageId ?? null,
          metaTitle: dto.metaTitle,
          metaDescription: dto.metaDescription,
          metaKeywords: dto.metaKeywords,
          category: dto.category,
        },
        include: { thumbnail: true },
      });
    }

    const duplicate = await this.prisma.blogPost.findFirst({
      where: { storeId, domainId, slug },
    });
    if (duplicate) {
      throw new BadRequestException('A post with this slug already exists.');
    }

    return this.prisma.blogPost.create({
      data: {
        storeId,
        domainId,
        slug,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content ?? '',
        author: dto.author,
        status,
        publishedAt,
        thumbnailImageId: dto.thumbnailImageId ?? null,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        metaKeywords: dto.metaKeywords,
        category: dto.category,
      },
      include: { thumbnail: true },
    });
  }

  async deleteBlogPost(id: string, brandSlug: string) {
    const storeId = await this.resolveStoreId(brandSlug);
    const post = await this.prisma.blogPost.findFirst({
      where: { id, storeId },
    });
    if (!post) {
      throw new NotFoundException('Blog post not found.');
    }
    await this.prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }

  async getSitemapData(params: {
    brandSlug?: string;
    host?: string;
    pathPrefix?: string;
    domainId?: string;
    baseUrl: string;
  }) {
    const ctx = await this.resolveContext(params);
    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: ctx.storeId },
    });

    const domain = ctx.domainId
      ? await this.prisma.storeDomain.findUnique({ where: { id: ctx.domainId } })
      : null;

    const pathBase =
      domain?.pathPrefix && domain.pathPrefix !== '/'
        ? domain.pathPrefix.replace(/\/$/, '')
        : '';

    const prefix = `${params.baseUrl.replace(/\/$/, '')}${pathBase}`;

    const staticPaths = [
      '',
      '/menu',
      '/order-online',
      '/about',
      '/deals',
      '/locations',
      '/blog',
      '/catering',
      '/faq',
      '/contact',
      '/delivery',
      '/privacy',
      '/terms',
      '/allergens',
      '/gallery',
      '/reviews',
      '/gift-cards',
      '/loyalty',
      '/careers',
      '/functions',
      '/nutrition',
    ];
    const urls: Array<{ loc: string; lastmod?: string }> = staticPaths.map(
      (path) => ({
        loc: `${prefix}${path || '/'}`,
        lastmod: brand.updatedAt.toISOString(),
      }),
    );

    const menuItems = await this.prisma.menuItem.findMany({
      where: { brandId: ctx.storeId, isActive: true },
      select: { id: true, updatedAt: true },
    });
    for (const item of menuItems) {
      urls.push({
        loc: `${prefix}/menu/${item.id}`,
        lastmod: item.updatedAt.toISOString(),
      });
    }

    const deals = await this.prisma.deal.findMany({
      where: { brandId: ctx.storeId, isActive: true },
      select: { id: true, updatedAt: true },
    });
    for (const deal of deals) {
      urls.push({
        loc: `${prefix}/deals#${deal.id}`,
        lastmod: deal.updatedAt.toISOString(),
      });
    }

    const posts = await this.listBlogPosts({
      brandSlug: ctx.brandSlug,
      domainId: ctx.domainId ?? undefined,
      includeDrafts: false,
    });
    for (const post of posts) {
      urls.push({
        loc: `${prefix}/blog/${post.slug}`,
        lastmod: (post.updatedAt ?? post.publishedAt ?? post.createdAt).toISOString(),
      });
    }

    return { urls, brandSlug: ctx.brandSlug, domainId: ctx.domainId };
  }

  getRobotsConfig() {
    return {
      disallow: [
        '/seo-login',
        '/seo-dashboard',
        '/admin',
        '/login',
        '/checkout',
        '/cart',
      ],
      allow: ['/'],
    };
  }

  /**
   * Fill SEO page fields from Brand + default Location.
   * By default only fills empty content/meta. Pass overwrite=true to replace all.
   */
  async fillFromStore(
    brandSlug: string,
    domainId: string | null,
    options?: { overwrite?: boolean },
  ) {
    const overwrite = options?.overwrite === true;
    const brand = await this.prisma.brand.findUnique({
      where: { slug: (brandSlug ?? DEFAULT_BRAND_SLUG).trim().toLowerCase() },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          take: 1,
        },
      },
    });
    if (!brand) {
      throw new NotFoundException(`Store "${brandSlug}" not found.`);
    }

    const location = brand.locations[0];
    const name = brand.name;
    const tagline =
      brand.tagline?.trim() ||
      `Order pizza and pasta from ${name}`;
    const suburb = location?.suburb?.trim() || '';
    const address = location?.address?.trim() || '';
    const phone = location?.phone?.trim() || '';
    const place = suburb || address || 'Australia';

    const defaults: Array<{
      page: string;
      section: string;
      content: string;
      metaTitle?: string;
      metaDescription?: string;
      metaKeywords?: string;
      ogImageUrl?: string;
      robotsIndex?: boolean;
    }> = [
      {
        page: 'home',
        section: 'hero_h1',
        content: `Welcome to ${name}`,
      },
      {
        page: 'home',
        section: 'hero_h2',
        content: tagline,
      },
      {
        page: 'home',
        section: 'hero_body',
        content: `Fresh pizza and pasta in ${place}. Order online for delivery or pickup.`,
      },
      {
        page: 'home',
        section: 'page_title',
        content: `${name} | Order Online`,
        metaTitle: `${name} | Order Online`,
        metaDescription: `${tagline} — ${place}${phone ? ` · ${phone}` : ''}.`,
        metaKeywords: `${name}, pizza, pasta, delivery, ${place}`,
        ogImageUrl: brand.heroImageUrl ?? brand.logoUrl ?? undefined,
        robotsIndex: true,
      },
      {
        page: 'about',
        section: 'hero_h1',
        content: `About ${name}`,
      },
      {
        page: 'about',
        section: 'hero_body',
        content: `We serve fresh pizza and pasta from our kitchen in ${place}.`,
      },
      {
        page: 'about',
        section: 'page_title',
        content: `About | ${name}`,
        metaTitle: `About | ${name}`,
        metaDescription: `Learn about ${name} in ${place}.`,
        robotsIndex: true,
      },
      {
        page: 'deals',
        section: 'hero_h1',
        content: 'Deals & Promotions',
      },
      {
        page: 'deals',
        section: 'hero_body',
        content: `Limited-time savings from ${name}.`,
      },
      {
        page: 'deals',
        section: 'page_title',
        content: `Deals | ${name}`,
        metaTitle: `Deals | ${name}`,
        metaDescription: `Current deals and promotions at ${name}.`,
        robotsIndex: true,
      },
      {
        page: 'locations',
        section: 'hero_h1',
        content: 'Find us',
      },
      {
        page: 'locations',
        section: 'hero_body',
        content: address
          ? `Visit us at ${address}${phone ? ` or call ${phone}` : ''}.`
          : `Find ${name} near you.`,
      },
      {
        page: 'locations',
        section: 'page_title',
        content: `Locations | ${name}`,
        metaTitle: `Locations | ${name}`,
        metaDescription: address
          ? `${name} — ${address}`
          : `Locations for ${name}.`,
        robotsIndex: true,
      },
      {
        page: 'blog',
        section: 'hero_h1',
        content: `${name} Blog`,
      },
      {
        page: 'blog',
        section: 'hero_body',
        content: `News and stories from our kitchen in ${place}.`,
      },
      {
        page: 'blog',
        section: 'page_title',
        content: `Blog | ${name}`,
        metaTitle: `Blog | ${name}`,
        metaDescription: `News and updates from ${name}.`,
        robotsIndex: true,
      },
    ];

    const existing = await this.prisma.seoContent.findMany({
      where: {
        storeId: brand.id,
        domainId: domainId ?? null,
      },
    });
    const existingKey = new Set(
      existing.map((row) => `${row.page}:${row.section}`),
    );

    const items = defaults.filter((item) => {
      if (overwrite) return true;
      const key = `${item.page}:${item.section}`;
      if (!existingKey.has(key)) return true;
      const row = existing.find(
        (r) => r.page === item.page && r.section === item.section,
      );
      if (!row) return true;
      const contentEmpty = !row.content?.trim();
      const metaEmpty =
        item.section === 'page_title'
          ? !row.metaTitle?.trim() && !row.metaDescription?.trim()
          : true;
      return contentEmpty && metaEmpty;
    });

    if (items.length === 0) {
      return { updated: 0, rows: existing };
    }

    const rows = await this.bulkUpsertContent(brand.slug, {
      domainId,
      items,
    });

    return { updated: items.length, rows };
  }

  /** Create a draft welcome blog post if the store has none. */
  async ensureStarterBlog(brandSlug: string, domainId: string | null = null) {
    const storeId = await this.resolveStoreId(brandSlug);
    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: storeId },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          take: 1,
        },
      },
    });

    const existing = await this.prisma.blogPost.findFirst({
      where: { storeId, domainId },
    });
    if (existing) {
      return { created: false, post: existing };
    }

    const suburb = brand.locations[0]?.suburb?.trim() || '';
    const place = suburb || 'our kitchen';
    const slug = 'welcome-to-our-kitchen';

    const post = await this.prisma.blogPost.create({
      data: {
        storeId,
        domainId,
        slug,
        title: `Welcome to ${brand.name}`,
        excerpt: `Meet ${brand.name} — fresh pizza and pasta from ${place}.`,
        content: `<p>Thanks for visiting <strong>${brand.name}</strong>.</p><p>We craft pizza and pasta with fresh ingredients${suburb ? ` right here in ${suburb}` : ''}. Order online for delivery or pickup, and check back here for deals, seasonal specials, and kitchen news.</p>`,
        status: BlogPostStatus.DRAFT,
        author: brand.name,
        category: 'News',
        metaTitle: `Welcome to ${brand.name}`,
        metaDescription: `Meet ${brand.name} — fresh pizza and pasta from ${place}.`,
        metaKeywords: `${brand.name}, pizza, blog, ${place}`,
      },
      include: { thumbnail: true },
    });

    return { created: true, post };
  }

  async bootstrapNewStore(brandSlug: string) {
    await this.fillFromStore(brandSlug, null, { overwrite: true });
    await this.ensureStarterBlog(brandSlug, null);
    return { ok: true };
  }

  async getLaunchChecklist(brandSlug: string, domainId: string | null) {
    const brand = await this.prisma.brand.findUnique({
      where: { slug: (brandSlug ?? DEFAULT_BRAND_SLUG).trim().toLowerCase() },
      include: {
        domains: { where: { isActive: true }, orderBy: [{ isPrimary: 'desc' }] },
        locations: {
          where: { isActive: true },
          take: 1,
          orderBy: [{ isDefault: 'desc' }],
        },
        _count: {
          select: {
            seoContent: true,
            blogPosts: true,
          },
        },
      },
    });
    if (!brand) {
      throw new NotFoundException(`Store "${brandSlug}" not found.`);
    }

    const domain = domainId
      ? brand.domains.find((d) => d.id === domainId)
      : brand.domains.find((d) => d.isPrimary) ?? brand.domains[0];

    const primaryHost =
      domain?.host ||
      process.env.WEB_DOMAIN ||
      'marinapizzas.com.au';
    const pathPrefix = domain?.pathPrefix || '';
    const origin = `https://${primaryHost}`;
    const sitemapUrl = `${origin}/sitemap.xml`;
    const robotsUrl = `${origin}/robots.txt`;
    const location = brand.locations[0];

    return {
      brandSlug: brand.slug,
      storeName: brand.name,
      googleSiteVerification: brand.googleSiteVerification,
      hasVerification: Boolean(brand.googleSiteVerification?.trim()),
      sitemapSubmittedAt: brand.sitemapSubmittedAt,
      sitemapSubmitted: Boolean(brand.sitemapSubmittedAt),
      hasAddress: Boolean(location?.address?.trim()),
      hasPhone: Boolean(location?.phone?.trim()),
      seoContentCount: brand._count.seoContent,
      blogPostCount: brand._count.blogPosts,
      domain: domain
        ? {
            id: domain.id,
            host: domain.host,
            pathPrefix: domain.pathPrefix,
          }
        : null,
      sitemapUrl,
      robotsUrl,
      publicHomeUrl: `${origin}${pathPrefix || ''}`,
      gscSteps: [
        `Add a Google Search Console property for ${domain?.host ? `https://${domain.host}` : origin}.`,
        brand.googleSiteVerification
          ? 'Verification meta tag is set — finish verification in GSC if not done yet.'
          : 'Paste the GSC HTML-tag content token below, save, then verify in GSC.',
        `Submit sitemap in GSC: ${sitemapUrl}`,
        `Confirm robots.txt lists Sitemap: ${robotsUrl}`,
        brand.sitemapSubmittedAt
          ? `Marked sitemap submitted on ${brand.sitemapSubmittedAt.toISOString().slice(0, 10)}.`
          : 'After submitting the sitemap in GSC, tick “Sitemap submitted” below.',
      ],
    };
  }

  async updateGscSettings(brandSlug: string, dto: UpdateSeoGscSettingsDto) {
    const storeId = await this.resolveStoreId(brandSlug);
    const data: {
      googleSiteVerification?: string | null;
      sitemapSubmittedAt?: Date | null;
    } = {};

    if (dto.googleSiteVerification !== undefined) {
      data.googleSiteVerification =
        dto.googleSiteVerification?.trim() || null;
    }
    if (dto.sitemapSubmitted === true) {
      data.sitemapSubmittedAt = new Date();
    } else if (dto.sitemapSubmitted === false) {
      data.sitemapSubmittedAt = null;
    }

    return this.prisma.brand.update({
      where: { id: storeId },
      data,
      select: {
        slug: true,
        googleSiteVerification: true,
        sitemapSubmittedAt: true,
      },
    });
  }

  private normalizeRedirectPath(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
      throw new BadRequestException('Path is required.');
    }
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        return url.pathname || '/';
      } catch {
        throw new BadRequestException('Invalid redirect path.');
      }
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }

  async listRedirects(brandSlug: string) {
    const storeId = await this.resolveStoreId(brandSlug);
    return this.prisma.seoRedirect.findMany({
      where: { storeId },
      orderBy: { fromPath: 'asc' },
    });
  }

  async saveRedirect(brandSlug: string, dto: SaveSeoRedirectDto) {
    const storeId = await this.resolveStoreId(brandSlug);
    const fromPath = this.normalizeRedirectPath(dto.fromPath);
    const toPath = this.normalizeRedirectPath(dto.toPath);
    if (fromPath === toPath) {
      throw new BadRequestException('From and to paths must differ.');
    }

    if (dto.id) {
      const existing = await this.prisma.seoRedirect.findFirst({
        where: { id: dto.id, storeId },
      });
      if (!existing) {
        throw new NotFoundException('Redirect not found.');
      }
      return this.prisma.seoRedirect.update({
        where: { id: dto.id },
        data: {
          fromPath,
          toPath,
          isActive: dto.isActive ?? true,
        },
      });
    }

    return this.prisma.seoRedirect.upsert({
      where: { storeId_fromPath: { storeId, fromPath } },
      create: {
        storeId,
        fromPath,
        toPath,
        isActive: dto.isActive ?? true,
      },
      update: {
        toPath,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async deleteRedirect(id: string, brandSlug: string) {
    const storeId = await this.resolveStoreId(brandSlug);
    const existing = await this.prisma.seoRedirect.findFirst({
      where: { id, storeId },
    });
    if (!existing) {
      throw new NotFoundException('Redirect not found.');
    }
    await this.prisma.seoRedirect.delete({ where: { id } });
    return { success: true };
  }

  async resolveRedirect(host: string | undefined, path: string) {
    const pathname = this.normalizeRedirectPath(path || '/');
    if (!host?.trim()) {
      return null;
    }

    const domain = await this.prisma.storeDomain.findFirst({
      where: {
        isActive: true,
        host: host.trim().toLowerCase(),
      },
      select: { storeId: true },
    });
    if (!domain) {
      return null;
    }

    const redirect = await this.prisma.seoRedirect.findFirst({
      where: {
        storeId: domain.storeId,
        fromPath: pathname,
        isActive: true,
      },
    });
    if (!redirect) {
      return null;
    }

    return { toPath: redirect.toPath, fromPath: redirect.fromPath };
  }
}
