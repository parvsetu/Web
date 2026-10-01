/**
 * The registration-review migration must keep the live DB's existing events
 * running: it is replayed here on a scratch schema holding pre-migration data.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATION = '20261002090000_registration_review_event_fees_agents';
const DIR = join(__dirname, '../prisma/migrations');

/** Splits a migration file into statements (respects quotes, $$ bodies and -- comments). */
function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote: string | null = null;
  while (i < sql.length) {
    const c = sql[i];
    if (!quote && c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (!quote && c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { quote = m[0]; cur += m[0]; i += m[0].length; continue; }
    } else if (quote && quote.startsWith('$') && sql.startsWith(quote, i)) {
      cur += quote; i += quote.length; quote = null; continue;
    }
    if (!quote && c === "'") quote = "'";
    else if (quote === "'" && c === "'") quote = null;
    if (!quote && c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

describe('Existing-data migration (e2e)', () => {
  const db = new PrismaClient();
  const schema = `mig_legacy_${Date.now()}`;
  afterAll(async () => {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it('existing events become LIVE (legacy, fee 0) and new events default to DRAFT', async () => {
    const dirs = readdirSync(DIR).filter((d) => /^\d{14}_/.test(d)).sort();
    const before = dirs.filter((d) => d < MIGRATION);
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      for (const d of before) for (const s of statements(readFileSync(join(DIR, d, 'migration.sql'), 'utf8'))) await tx.$executeRawUnsafe(s);
      // Pre-migration data: a running festival and a draft one.
      await tx.$executeRawUnsafe(`INSERT INTO organizations (id, name, slug, "updatedAt") VALUES ('o1', 'Old Mandal', 'old-mandal', now())`);
      await tx.$executeRawUnsafe(`INSERT INTO events (id, "organizationId", name, "festivalType", "startDate", "endDate", status, "tokenPrefix", "updatedAt")
        VALUES ('e1', 'o1', 'Durga Puja', 'DURGA_PUJA', '2026-10-01', '2026-10-10', 'ACTIVE', 'DUR', now()),
               ('e2', 'o1', 'Kali Puja', 'KALI_PUJA', '2026-11-01', '2026-11-02', 'DRAFT', 'KAL', now())`);
      for (const s of statements(readFileSync(join(DIR, MIGRATION, 'migration.sql'), 'utf8'))) await tx.$executeRawUnsafe(s);
      const rows = await tx.$queryRawUnsafe<{ id: string; approvalStatus: string; feeLegacy: boolean; feePaise: number; status: string }[]>(
        `SELECT id, "approvalStatus"::text AS "approvalStatus", "feeLegacy", "feePaise", status::text AS status FROM events ORDER BY id`);
      expect(rows).toEqual([
        { id: 'e1', approvalStatus: 'LIVE', feeLegacy: true, feePaise: 0, status: 'ACTIVE' },
        { id: 'e2', approvalStatus: 'LIVE', feeLegacy: true, feePaise: 0, status: 'DRAFT' },
      ]);
      await tx.$executeRawUnsafe(`INSERT INTO events (id, "organizationId", name, "festivalType", "startDate", "endDate", "tokenPrefix", "updatedAt") VALUES ('e3', 'o1', 'New', 'HOLI', '2027-03-01', '2027-03-02', 'HOL', now())`);
      const fresh = await tx.$queryRawUnsafe<{ approvalStatus: string; feeLegacy: boolean }[]>(`SELECT "approvalStatus"::text AS "approvalStatus", "feeLegacy" FROM events WHERE id = 'e3'`);
      expect(fresh[0]).toEqual({ approvalStatus: 'DRAFT', feeLegacy: false });
      // Existing organizations keep their festival list and need no registration row.
      const orgs = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM organizations WHERE "agentId" IS NULL`);
      expect(Number(orgs[0].n)).toBe(1);
    }, { timeout: 60_000 });
  });
});
