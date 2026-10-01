import { Global, Injectable, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** A Prisma transaction (or the client). A non-DB store ignores it. */
export type ImageDb = Prisma.TransactionClient | PrismaService;

export interface StoredImageData {
  bytes: Buffer;
  mimeType: string;
}

/**
 * Where image bytes live. Callers keep only the returned key on their own
 * rows (Organization.logoKey, EventPhoto.imageKey…), so moving to S3/R2 is a
 * new implementation of this interface bound to IMAGE_STORE — no caller changes.
 */
export interface ImageStore {
  /** Saves the bytes and returns their key. `prefix` groups keys (e.g. "org/<id>/logo"). */
  put(input: { prefix: string; organizationId: string | null; bytes: Buffer; mimeType: string }, db?: ImageDb): Promise<string>;
  get(key: string): Promise<StoredImageData | null>;
  /** Idempotent; null/undefined keys are skipped. */
  delete(keys: (string | null | undefined)[], db?: ImageDb): Promise<void>;
}

export const IMAGE_STORE = Symbol('IMAGE_STORE');

/** Current implementation: bytes in the `stored_images` table (Postgres bytea). */
@Injectable()
export class DbImageStore implements ImageStore {
  constructor(private readonly prisma: PrismaService) {}

  async put(input: { prefix: string; organizationId: string | null; bytes: Buffer; mimeType: string }, db: ImageDb = this.prisma) {
    const key = `${input.prefix}/${randomUUID()}`;
    await db.storedImage.create({
      data: { key, organizationId: input.organizationId, mimeType: input.mimeType, sizeBytes: input.bytes.length, bytes: input.bytes },
    });
    return key;
  }

  async get(key: string) {
    const row = await this.prisma.storedImage.findUnique({ where: { key }, select: { bytes: true, mimeType: true } });
    return row ? { bytes: Buffer.from(row.bytes), mimeType: row.mimeType } : null;
  }

  async delete(keys: (string | null | undefined)[], db: ImageDb = this.prisma) {
    const list = keys.filter((k): k is string => !!k);
    if (list.length) await db.storedImage.deleteMany({ where: { key: { in: list } } });
  }
}

@Global()
@Module({ providers: [{ provide: IMAGE_STORE, useClass: DbImageStore }], exports: [IMAGE_STORE] })
export class ImagesModule {}
