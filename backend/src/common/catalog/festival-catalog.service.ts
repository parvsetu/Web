import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FESTIVAL_TYPES, FestivalTypeDef, defaultPrefixFor } from '../festival-types';

type Db = Prisma.TransactionClient | PrismaService;

export const FESTIVAL_GROUPS = [...new Set(FESTIVAL_TYPES.map((f) => f.group))];

export interface CatalogEntry {
  key: string;
  label: string;
  defaultPrefix: string;
  group: string;
  months?: string;
  description?: string | null;
  /** Added by the super admin from a mandal's "my event isn't listed" request. */
  custom?: boolean;
}

/**
 * The festival catalog = the code presets (FESTIVAL_TYPES) merged with the
 * DB-backed custom types the super admin added to the catalog. Keys stay
 * UPPER_SNAKE so Event.festivalType works the same for both.
 */
@Injectable()
export class FestivalCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(db: Db = this.prisma): Promise<CatalogEntry[]> {
    const customs = await db.customFestivalType.findMany({ where: { inCatalog: true, status: 'APPROVED' }, orderBy: { label: 'asc' } });
    const preset: CatalogEntry[] = FESTIVAL_TYPES.map((f) => ({ ...f }));
    // Customs sit just before "Other" so the grouped dropdown stays tidy.
    const other = preset.filter((f) => f.group === 'Other');
    return [
      ...preset.filter((f) => f.group !== 'Other'),
      ...customs.map((c) => ({ key: c.key, label: c.label, defaultPrefix: c.defaultPrefix, group: c.group, description: c.description, custom: true })),
      ...other,
    ];
  }

  /** A preset or any custom type (whatever its review state). */
  async find(key: string, db: Db = this.prisma): Promise<(CatalogEntry & { status?: string; inCatalog?: boolean; organizationId?: string | null }) | null> {
    const preset = FESTIVAL_TYPES.find((f) => f.key === key);
    if (preset) return { ...(preset as FestivalTypeDef) };
    const c = await db.customFestivalType.findUnique({ where: { key } });
    return c ? { key: c.key, label: c.label, defaultPrefix: c.defaultPrefix, group: c.group, description: c.description, custom: true, status: c.status, inCatalog: c.inCatalog, organizationId: c.organizationId } : null;
  }

  /** Every key must be a preset or an approved custom type (super admin setting a mandal's allowed list). */
  async assertKnown(keys: string[], db: Db = this.prisma) {
    const unknown = keys.filter((k) => !FESTIVAL_TYPES.some((f) => f.key === k));
    if (!unknown.length) return;
    const found = await db.customFestivalType.findMany({ where: { key: { in: unknown }, status: 'APPROVED' }, select: { key: true } });
    const missing = unknown.filter((k) => !found.some((f) => f.key === k));
    if (missing.length) throw new BadRequestException({ message: `Unknown festival type: ${missing.join(', ')}`, code: 'UNKNOWN_FESTIVAL_TYPE' });
  }

  /** Fresh UPPER_SNAKE key for a custom festival name, unique across presets and customs. */
  async newCustomKey(label: string, db: Db = this.prisma) {
    const base = (label.normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase() || 'CUSTOM_EVENT').slice(0, 34);
    const start = /^[A-Z]/.test(base) ? base : `EV_${base}`.slice(0, 34);
    let key = start.length >= 2 ? start : `${start}_EVENT`;
    for (let i = 2; FESTIVAL_TYPES.some((f) => f.key === key) || (await db.customFestivalType.findUnique({ where: { key } })); i++) key = `${start}_${i}`;
    return key;
  }

  prefixFor(key: string) {
    return defaultPrefixFor(key);
  }
}
