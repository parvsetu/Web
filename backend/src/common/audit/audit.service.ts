import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  organizationId?: string | null;
  eventId?: string | null;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

type Db = Prisma.TransactionClient | PrismaService;

/** Who / what / when / which event / before / after / reason. Pass the tx so
 *  the audit row commits or rolls back with the change it describes. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Db = this.prisma) {
    await db.auditLog.create({
      data: {
        organizationId: entry.organizationId ?? null,
        eventId: entry.eventId ?? null,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        reason: entry.reason ?? null,
      },
    });
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (v === undefined || v === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(v));
}
