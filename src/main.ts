import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { CorsOriginsService } from './hq/cors-origins.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const corsOrigins = app.get(CorsOriginsService);

  const uploadsRoot = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsRoot)) {
    mkdirSync(join(uploadsRoot, 'logos'), { recursive: true });
    mkdirSync(join(uploadsRoot, 'heroes'), { recursive: true });
  } else if (!existsSync(join(uploadsRoot, 'heroes'))) {
    mkdirSync(join(uploadsRoot, 'heroes'), { recursive: true });
  }

  app.useStaticAssets(uploadsRoot, {
    prefix: '/api/uploads/',
  });

  app.setGlobalPrefix(configService.get<string>('API_PREFIX', 'api'));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await corsOrigins.refresh();

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.isAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Brand-Slug',
      'X-Location-Id',
      'Accept',
      'Origin',
    ],
  });

  const port = Number(configService.get<string>('PORT', '3001'));

  const expressApp = app.getHttpAdapter().getInstance() as {
    set: (setting: string, value: number) => void;
  };
  expressApp.set('trust proxy', 1);

  await app.listen(port);
}

void bootstrap();
