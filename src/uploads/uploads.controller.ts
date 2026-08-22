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
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SeoAccessGuard } from '../common/guards/seo-access.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StoreAccessService } from '../common/services/store-access.service';
import { SeoService } from '../seo/seo.service';

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

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(
    private readonly storeAccess: StoreAccessService,
    private readonly seoService: SeoService,
  ) {}

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureLogosDir();
          cb(null, LOGOS_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(
            new BadRequestException(
              'Logo must be a JPEG, PNG, WebP, or GIF image.',
            ) as unknown as Error,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.storeAccess.canAccessAdminApp(user))) {
      throw new ForbiddenException('Admin access required.');
    }

    if (!file) {
      throw new BadRequestException('No image file uploaded.');
    }

    return {
      url: `/api/uploads/logos/${file.filename}`,
      filename: file.filename,
    };
  }

  @Post('hero')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureHeroesDir();
          cb(null, HEROES_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(
            new BadRequestException(
              'Hero image must be a JPEG, PNG, WebP, or GIF image.',
            ) as unknown as Error,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadHero(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!(await this.storeAccess.canAccessAdminApp(user))) {
      throw new ForbiddenException('Admin access required.');
    }

    if (!file) {
      throw new BadRequestException('No image file uploaded.');
    }

    return {
      url: `/api/uploads/heroes/${file.filename}`,
      filename: file.filename,
    };
  }

  @Post('seo')
  @UseGuards(SeoAccessGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureSeoDir();
          cb(null, SEO_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(
            new BadRequestException(
              'SEO image must be a JPEG, PNG, WebP, or GIF image.',
            ) as unknown as Error,
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadSeoImage(
    @UploadedFile() file: Express.Multer.File | undefined,
    @BrandSlug() brandSlug: string | undefined,
    @Query('domainId') domainId?: string,
    @Query('label') label?: string,
    @Query('page') page?: string,
    @Query('section') section?: string,
    @Query('altText') altText?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No image file uploaded.');
    }

    const normalizedDomainId =
      domainId === 'null' || domainId === '' ? null : domainId;

    const record = await this.seoService.createImageRecord({
      brandSlug: brandSlug ?? 'leovorno',
      domainId: normalizedDomainId,
      filename: file.filename,
      filePath: `/api/uploads/seo/${file.filename}`,
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
