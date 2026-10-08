import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SeoAccessGuard } from '../common/guards/seo-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StoreAccessService } from '../common/services/store-access.service';
import { SeoService } from '../seo/seo.service';
import { blurHashFromFile } from '../common/utils/blur-hash.util';

const LOGOS_DIR = join(process.cwd(), 'uploads', 'logos');
const HEROES_DIR = join(process.cwd(), 'uploads', 'heroes');
const SEO_DIR = join(process.cwd(), 'uploads', 'seo');
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function ensureLogosDir(): void {
  if (!existsSync(LOGOS_DIR)) {
    mkdirSync(LOGOS_DIR, { recursive: true });
  }
}

function ensureHeroesDir(): void {
  if (!existsSync(HEROES_DIR)) {
    mkdirSync(HEROES_DIR, { recursive: true });
  }
}

function ensureSeoDir(): void {
  if (!existsSync(SEO_DIR)) {
    mkdirSync(SEO_DIR, { recursive: true });
  }
}

const FORMAT_EXT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
};

/**
 * Writes an upload only after decoding it: the extension comes from the real
 * image format, never from the client's filename or MIME type, so an HTML or
 * SVG file labelled image/png can't end up served from our domain.
 */
async function saveVerifiedImage(
  file: Express.Multer.File | undefined,
  dir: string,
  label: string,
): Promise<{ filename: string; path: string }> {
  if (!file) {
    throw new BadRequestException('No image file uploaded.');
  }
  let format: string | undefined;
  try {
    format = (await sharp(file.buffer).metadata()).format;
  } catch {
    format = undefined;
  }
  const ext = format ? FORMAT_EXT[format] : undefined;
  if (!ext) {
    throw new BadRequestException(
      `${label} must be a JPEG, PNG, WebP, or GIF image.`,
    );
  }
  const filename = `${randomUUID()}${ext}`;
  const path = join(dir, filename);
  await writeFile(path, file.buffer);
  return { filename, path };
}

function imageUpload(maxBytes: number, label: string) {
  return FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        cb(
          new BadRequestException(
            `${label} must be a JPEG, PNG, WebP, or GIF image.`,
          ) as unknown as Error,
          false,
        );
        return;
      }
      cb(null, true);
    },
  });
}

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private readonly storeAccess: StoreAccessService,
    private readonly seoService: SeoService,
  ) {}

  @Post('logo')
  @UseInterceptors(imageUpload(2 * 1024 * 1024, 'Logo'))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.storeAccess.canAccessAdminApp(user))) {
      throw new ForbiddenException('Admin access required.');
    }

    ensureLogosDir();
    const saved = await saveVerifiedImage(file, LOGOS_DIR, 'Logo');
    const blurHash = await blurHashFromFile(saved.path);

    return {
      url: `/api/uploads/logos/${saved.filename}`,
      filename: saved.filename,
      blurHash,
    };
  }

  @Post('hero')
  @UseInterceptors(imageUpload(5 * 1024 * 1024, 'Hero image'))
  async uploadHero(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.storeAccess.canAccessAdminApp(user))) {
      throw new ForbiddenException('Admin access required.');
    }

    ensureHeroesDir();
    const saved = await saveVerifiedImage(file, HEROES_DIR, 'Hero image');
    const blurHash = await blurHashFromFile(saved.path);

    return {
      url: `/api/uploads/heroes/${saved.filename}`,
      filename: saved.filename,
      blurHash,
    };
  }

  @Post('seo')
  @UseGuards(SeoAccessGuard)
  @UseInterceptors(imageUpload(5 * 1024 * 1024, 'SEO image'))
  async uploadSeoImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @BrandSlug() brandSlug: string | undefined,
    @Query('domainId') domainId?: string,
    @Query('label') label?: string,
    @Query('page') page?: string,
    @Query('section') section?: string,
    @Query('altText') altText?: string,
  ) {
    ensureSeoDir();
    const saved = await saveVerifiedImage(file, SEO_DIR, 'SEO image');

    const normalizedDomainId =
      domainId === 'null' || domainId === '' ? null : domainId;

    const record = await this.seoService.createImageRecord({
      brandSlug: brandSlug ?? DEFAULT_BRAND_SLUG,
      domainId: normalizedDomainId,
      filename: saved.filename,
      filePath: `/api/uploads/seo/${saved.filename}`,
      label,
      page,
      section,
      altText,
    });

    return {
      id: record.id,
      url: record.filePath,
      filename: record.filename,
    };
  }
}
