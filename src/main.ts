import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';

const FRONTEND_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

function getOrigins() {
  const list = FRONTEND_ORIGINS.length > 0 ? FRONTEND_ORIGINS : DEFAULT_DEV_ORIGINS;
  if (process.env.NODE_ENV === 'production') return list;
  return [/localhost/, /127\.0\.0\.1/, ...list];
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy', true);

  app.enableCors({
    origin: getOrigins(),
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,X-Requested-With,Accept,Origin',
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: false,
  }));

  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads', maxAge: '7d' });

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`🌟 LUMNG API on port ${port} · env=${process.env.NODE_ENV || 'dev'}`);
}
bootstrap();
