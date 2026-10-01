import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  express.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  express.disable('x-powered-by');
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()),
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }),
  );
  return app;
}

export function assertConfig() {
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'QR_SIGNING_SECRET']) {
    if (!process.env[key]) throw new Error(`${key} must be set`);
  }
  if (process.env.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET', 'QR_SIGNING_SECRET']) {
      if ((process.env[key] ?? '').length < 32 || process.env[key]!.startsWith('change-me')) {
        throw new Error(`${key} must be a long random secret in production`);
      }
    }
    if (process.env.PAYMENTS_MOCK_ENABLED === 'true') throw new Error('PAYMENTS_MOCK_ENABLED must not be on in production');
  }
}
