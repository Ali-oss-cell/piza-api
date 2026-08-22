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
  UpdateSeoContentDto,
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
    return this.prisma.seoImage.findMany({
      where: {
        storeId,
        domainId: domainId ?? null,
      },
      orderBy: { createdAt: 'desc' },
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
      : { status: BlogPostStatus.PUBLISHED };

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

    if (ctx.domainId) {
      const domainPost = await this.prisma.blogPost.findFirst({
        where: {
          storeId: ctx.storeId,
          domainId: ctx.domainId,
          slug: params.slug,
          ...(params.includeDrafts
            ? {}
            : { status: BlogPostStatus.PUBLISHED }),
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
        ...(params.includeDrafts ? {} : { status: BlogPostStatus.PUBLISHED }),
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

    const publishedAt = dto.publishedAt
      ? new Date(dto.publishedAt)
      : status === BlogPostStatus.PUBLISHED
        ? new Date()
        : null;

    if (dto.id) {
      const existing = await this.prisma.blogPost.findFirst({
        where: { id: dto.id, storeId },
      });
      if (!existing) {
        throw new NotFoundException('Blog post not found.');
      }

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

    const staticPaths = ['', '/about', '/deals', '/locations', '/blog'];
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
}
