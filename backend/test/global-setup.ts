import { execSync } from 'child_process';
import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

/**
 * Recreates the test schema from migrations (so the hand-written partial
 * unique index and CHECK constraints are under test too) and seeds the
 * permission catalog + system roles. Refuses to touch anything that isn't a
 * local *_test database.
 */
export default async function globalSetup() {
  config({ path: resolve(__dirname, '../.env.test'), override: true, quiet: true });
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test')) {
    throw new Error(`Refusing to reset non-test database ${url.hostname}${url.pathname}`);
  }
  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  admin.search = '';
  const pg = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  const dbName = url.pathname.slice(1);
  const exists = await pg.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM pg_database WHERE datname = '${dbName}'`);
  if (exists.length === 0) await pg.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
  await pg.$disconnect();

  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'pipe',
  });
  const { seedCatalog } = await import('../prisma/seed');
  const db = new PrismaClient();
  await seedCatalog(db);
  await db.$disconnect();
}
