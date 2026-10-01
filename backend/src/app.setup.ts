import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: INestApplication) {
  const express = app as NestExpressApplication;
  // Behind Render/other proxies set TRUST_PROXY=1 (hop count) so req.ip is the real client.
  const trust = process.env.TRUST_PROXY ?? 'loopback';
  express.set('trust proxy', /^\d+$/.test(trust) ? Number(trust) : trust === 'true' ? true : trust);
  express.disable('x-powered-by');
  app.use(helmet());
  // Room for a sponsor logo / payout proof (≤2 MB as base64) in a JSON body.
  express.useBodyParser('json', { limit: '3mb' });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins(process.env.CORS_ORIGINS ?? 'http://localhost:3000'), credentials: false });
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

/**
 * Comma-separated allow-list. An entry may contain `*` for one DNS-label
 * segment, e.g. `https://parvsetu-*.vercel.app` to admit Vercel preview URLs.
 */
export function corsOrigins(list: string): (string | RegExp)[] {
  return list.split(',').map((s) => s.trim()).filter(Boolean).map((o) =>
    o.includes('*')
      ? new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`)
      : o,
  );
}
