import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Post,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StoreAccessService } from '../common/services/store-access.service';

const LOGOS_DIR = join(process.cwd(), 'uploads', 'logos');
const HEROES_DIR = join(process.cwd(), 'uploads', 'heroes');
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

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly storeAccess: StoreAccessService) {}

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
}
