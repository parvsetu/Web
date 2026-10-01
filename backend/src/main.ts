import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertConfig, configureApp } from './app.setup';

async function bootstrap() {
  assertConfig();
  // rawBody: payment webhooks verify signatures over the exact bytes received.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Parvsetu API on http://localhost:${port}/api/v1`);
}
bootstrap();
