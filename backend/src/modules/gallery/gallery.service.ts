import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { EventPhoto, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { paged, paging } from '../../common/http';
import { ymd } from '../../common/time/validity';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import {
  GALLERY_QUOTA_BYTES, MAX_BANNER_BYTES, MAX_LOGO_BYTES, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_UPLOAD, MAX_THUMB_BYTES,
  UploadedImageFile, imageInfo,
} from '../../common/images/image-info';
import { orgImageUrls } from '../../common/org-brand';
import { OrgPhotoListQuery, PhotoListQuery, UpdatePhotoDto } from './gallery.dto';

/** Festivals whose public photos may be shown (drafts stay private). */
const PUBLIC_EVENT_STATUSES = ['ACTIVE', 'COMPLETED'] as const;

interface PhotoMeta {
  caption?: string;
  takenAt?: string;
  isPublic?: boolean;
}

export function presentPhoto(p: EventPhoto) {
  const base = `/events/${p.eventId}/photos/${p.id}/image`;
  return {
    id: p.id, eventId: p.eventId, caption: p.caption, isPublic: p.isPublic, width: p.width, height: p.height,
    sizeBytes: p.sizeBytes, mimeType: p.mimeType, takenAt: p.takenAt, createdAt: p.createdAt,
    uploadedById: p.uploadedById,
    /** Authenticated URLs (fetch with the bearer token). Bytes never change for an id. */
    url: base,
    thumbUrl: `${base}?size=thumb`,
    /** Plain <img> URLs, only while the photo is public. */
    publicUrl: p.isPublic ? `/public/photos/${p.id}/image` : null,
    publicThumbUrl: p.isPublic ? `/public/photos/${p.id}/image?size=thumb` : null,
  };
}

export function publicPhoto(p: EventPhoto) {
  return {
    id: p.id, eventId: p.eventId, caption: p.caption, width: p.width, height: p.height, takenAt: p.takenAt,
    url: `/public/photos/${p.id}/image`, thumbUrl: `/public/photos/${p.id}/image?size=thumb`,
  };
}

/**
 * Mandal logo/banner and the festival photo gallery. Bytes go through the
 * ImageStore (DB-backed today); this service only keeps keys and metadata.
 * The per-mandal quota (GALLERY_QUOTA_BYTES) is checked under the
 * organization row lock, so parallel uploads can't overshoot it.
 */
@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORE) private readonly store: ImageStore,
  ) {}

  // ─── Mandal logo & banner ────────────────────────────────────────────

  async setOrgImage(actor: RequestUser, orgId: string, kind: 'logo' | 'banner', file: UploadedImageFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload.');
    const max = kind === 'logo' ? MAX_LOGO_BYTES : MAX_BANNER_BYTES;
    if (file.size > max) throw new PayloadTooLargeException(`The ${kind} must be ${max / 1024 >= 1024 ? `${max / 1024 / 1024} MB` : `${max / 1024} KB`} or smaller.`);
    const info = imageInfo(file.buffer, kind);
    const keyField = kind === 'logo' ? 'logoKey' : 'bannerKey';
    const timeField = kind === 'logo' ? 'logoUpdatedAt' : 'bannerUpdatedAt';
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      const key = await this.store.put({ prefix: `org/${orgId}/${kind}`, organizationId: orgId, bytes: file.buffer, mimeType: info.type }, tx);
      const org = await tx.organization.update({ where: { id: orgId }, data: { [keyField]: key, [timeField]: new Date() } });
      await this.store.delete([before[keyField]], tx);
      await this.audit.log({
        organizationId: orgId, actorId: actor.id, action: `organization.${kind}_updated`, entityType: 'Organization', entityId: orgId,
        after: { type: info.type, width: info.width, height: info.height, sizeBytes: file.size },
      }, tx);
      return orgImageUrls(org);
    }, { timeout: 20_000 });
  }

  async removeOrgImage(actor: RequestUser, orgId: string, kind: 'logo' | 'banner') {
    const keyField = kind === 'logo' ? 'logoKey' : 'bannerKey';
    const timeField = kind === 'logo' ? 'logoUpdatedAt' : 'bannerUpdatedAt';
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
      const org = await tx.organization.update({ where: { id: orgId }, data: { [keyField]: null, [timeField]: null } });
      if (before[keyField]) {
        await this.store.delete([before[keyField]], tx);
        await this.audit.log({ organizationId: orgId, actorId: actor.id, action: `organization.${kind}_removed`, entityType: 'Organization', entityId: orgId }, tx);
      }
      return orgImageUrls(org);
    });
  }

  async orgImage(orgId: string, kind: 'logo' | 'banner') {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { logoKey: true, bannerKey: true } });
    const key = kind === 'logo' ? org?.logoKey : org?.bannerKey;
    const img = key ? await this.store.get(key) : null;
    if (!img) throw new NotFoundException(`No ${kind}`);
    return img;
  }

  // ─── Photos ──────────────────────────────────────────────────────────

  async usage(orgId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const agg = await db.eventPhoto.aggregate({ where: { organizationId: orgId }, _sum: { sizeBytes: true }, _count: { _all: true } });
    return { usedBytes: agg._sum.sizeBytes ?? 0, quotaBytes: GALLERY_QUOTA_BYTES, photos: agg._count._all };
  }

  private parseMeta(raw: string | undefined, count: number): PhotoMeta[] {
    if (!raw) return [];
    let meta: unknown;
    try {
      meta = JSON.parse(raw);
    } catch {
      throw new BadRequestException('meta must be a JSON array');
    }
    if (!Array.isArray(meta) || meta.length > count) throw new BadRequestException('meta must be an array with at most one entry per file');
    return meta.map((m, i) => {
      if (!m || typeof m !== 'object') throw new BadRequestException(`meta[${i}] must be an object`);
      const { caption, takenAt, isPublic } = m as Record<string, unknown>;
      if (caption !== undefined && (typeof caption !== 'string' || caption.length > 300)) throw new BadRequestException(`meta[${i}].caption must be text up to 300 characters`);
      if (takenAt !== undefined && (typeof takenAt !== 'string' || Number.isNaN(Date.parse(takenAt)))) throw new BadRequestException(`meta[${i}].takenAt must be a date`);
      if (isPublic !== undefined && typeof isPublic !== 'boolean') throw new BadRequestException(`meta[${i}].isPublic must be true or false`);
      return { caption: caption as string | undefined, takenAt: takenAt as string | undefined, isPublic: isPublic as boolean | undefined };
    });
  }

  /**
   * Multipart upload: `files` (1–10 images, already resized by the client) and
   * optional `thumbs` (same count/order, ~400 px). Without a thumbnail the full
   * image doubles as one. Every file's format and size are checked from its bytes.
   */
  async upload(actor: RequestUser, orgId: string, eventId: string, files: UploadedImageFile[] = [], thumbs: UploadedImageFile[] = [], metaRaw?: string) {
    if (!files.length) throw new BadRequestException('Choose at least one photo.');
    if (files.length > MAX_PHOTOS_PER_UPLOAD) throw new BadRequestException(`Upload at most ${MAX_PHOTOS_PER_UPLOAD} photos at a time.`);
    if (thumbs.length && thumbs.length !== files.length) throw new BadRequestException('Send one thumbnail per photo (or none).');
    const meta = this.parseMeta(metaRaw, files.length);
    const items = files.map((f, i) => {
      if (f.size > MAX_PHOTO_BYTES) throw new PayloadTooLargeException(`Each photo must be ${MAX_PHOTO_BYTES / 1024 / 1024} MB or smaller.`);
      const info = imageInfo(f.buffer, 'photo');
      const thumb = thumbs[i];
      if (thumb && thumb.size > MAX_THUMB_BYTES) throw new PayloadTooLargeException(`Each thumbnail must be ${MAX_THUMB_BYTES / 1024} KB or smaller.`);
      const thumbInfo = thumb ? imageInfo(thumb.buffer, 'thumbnail') : null;
      return { file: f, info, thumb, thumbInfo, meta: meta[i] ?? {} };
    });
    const incoming = items.reduce((s, it) => s + it.file.size + (it.thumb?.size ?? 0), 0);

    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize uploads per mandal so the quota check can't be raced.
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE`;
      const { usedBytes } = await this.usage(orgId, tx);
      if (usedBytes + incoming > GALLERY_QUOTA_BYTES) {
        throw new PayloadTooLargeException({
          statusCode: 413, code: 'GALLERY_QUOTA_EXCEEDED',
          message: `Not enough gallery space: ${mb(usedBytes)} of ${mb(GALLERY_QUOTA_BYTES)} used, this upload needs ${mb(incoming)}. Delete some photos first.`,
          usedBytes, quotaBytes: GALLERY_QUOTA_BYTES,
        });
      }
      const rows: EventPhoto[] = [];
      for (const it of items) {
        const imageKey = await this.store.put({ prefix: `org/${orgId}/photos`, organizationId: orgId, bytes: it.file.buffer, mimeType: it.info.type }, tx);
        const thumbKey = it.thumb && it.thumbInfo
          ? await this.store.put({ prefix: `org/${orgId}/thumbs`, organizationId: orgId, bytes: it.thumb.buffer, mimeType: it.thumbInfo.type }, tx)
          : null;
        rows.push(await tx.eventPhoto.create({
          data: {
            organizationId: orgId, eventId, imageKey, thumbKey, mimeType: it.info.type, width: it.info.width, height: it.info.height,
            sizeBytes: it.file.size + (it.thumb?.size ?? 0), caption: it.meta.caption?.trim() || null, isPublic: it.meta.isPublic ?? false,
            takenAt: it.meta.takenAt ? new Date(it.meta.takenAt) : null, uploadedById: actor.id,
          },
        }));
      }
      await this.audit.log({
        organizationId: orgId, eventId, actorId: actor.id, action: 'photos.uploaded', entityType: 'EventPhoto',
        after: { count: rows.length, sizeBytes: incoming, ids: rows.map((r) => r.id) },
      }, tx);
      return rows;
    }, { timeout: 60_000, maxWait: 10_000 });
    return { items: created.map((p) => presentPhoto(p)), usage: await this.usage(orgId) };
  }

  async list(eventId: string, q: PhotoListQuery) {
    const { page, pageSize, skip, take } = paging(q, 48);
    const where: Prisma.EventPhotoWhereInput = { eventId, isPublic: q.public ? true : undefined };
    const [rows, total] = await Promise.all([
      this.prisma.eventPhoto.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.eventPhoto.count({ where }),
    ]);
    const ev = await this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { organizationId: true } });
    return { ...paged(rows.map((p) => presentPhoto(p)), total, page, pageSize), usage: await this.usage(ev.organizationId) };
  }

  private async findPhoto(eventId: string, photoId: string) {
    const p = await this.prisma.eventPhoto.findFirst({ where: { id: photoId, eventId } });
    if (!p) throw new NotFoundException('Photo not found');
    return p;
  }

  async update(actor: RequestUser, eventId: string, photoId: string, dto: UpdatePhotoDto) {
    const before = await this.findPhoto(eventId, photoId);
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.eventPhoto.update({
        where: { id: photoId },
        data: { caption: dto.caption === undefined ? undefined : dto.caption.trim() || null, isPublic: dto.isPublic },
      });
      await this.audit.log({
        organizationId: p.organizationId, eventId, actorId: actor.id, action: 'photo.updated', entityType: 'EventPhoto', entityId: photoId,
        before: { caption: before.caption, isPublic: before.isPublic }, after: { caption: p.caption, isPublic: p.isPublic },
      }, tx);
      return presentPhoto(p);
    });
  }

  async remove(actor: RequestUser, eventId: string, photoId: string) {
    const p = await this.findPhoto(eventId, photoId);
    await this.prisma.$transaction(async (tx) => {
      await tx.eventPhoto.delete({ where: { id: photoId } });
      await this.store.delete([p.imageKey, p.thumbKey], tx);
      await this.audit.log({
        organizationId: p.organizationId, eventId, actorId: actor.id, action: 'photo.deleted', entityType: 'EventPhoto', entityId: photoId,
        before: { caption: p.caption, isPublic: p.isPublic, sizeBytes: p.sizeBytes },
      }, tx);
    });
  }

  async image(eventId: string, photoId: string, size: 'thumb' | 'full' = 'full') {
    const p = await this.findPhoto(eventId, photoId);
    return this.bytes(p, size);
  }

  private async bytes(p: EventPhoto, size: 'thumb' | 'full') {
    const img = await this.store.get(size === 'thumb' && p.thumbKey ? p.thumbKey : p.imageKey);
    if (!img) throw new NotFoundException('Photo not found');
    return img;
  }

  // ─── Public ──────────────────────────────────────────────────────────

  async publicImage(photoId: string, size: 'thumb' | 'full' = 'full') {
    const p = await this.prisma.eventPhoto.findFirst({
      where: { id: photoId, isPublic: true, event: { status: { in: [...PUBLIC_EVENT_STATUSES] }, approvalStatus: 'LIVE' } },
    }).catch(() => null);
    if (!p) throw new NotFoundException('Photo not found');
    return this.bytes(p, size);
  }

  async publicForEvent(eventId: string, q: PhotoListQuery) {
    const { page, pageSize, skip, take } = paging(q, 24);
    const where: Prisma.EventPhotoWhereInput = { eventId, isPublic: true, event: { status: { in: [...PUBLIC_EVENT_STATUSES] }, approvalStatus: 'LIVE' } };
    const [rows, total] = await Promise.all([
      this.prisma.eventPhoto.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.eventPhoto.count({ where }),
    ]);
    return paged(rows.map(publicPhoto), total, page, pageSize);
  }

  // ─── Mandal-wide gallery (look back year by year) ────────────────────

  /** Years → festivals with photo counts and a cover photo, newest first. */
  async orgSummary(orgId: string) {
    const groups = await this.prisma.eventPhoto.groupBy({
      by: ['eventId'], where: { organizationId: orgId }, _count: { _all: true }, _sum: { sizeBytes: true }, _max: { createdAt: true },
    });
    const publicCounts = await this.prisma.eventPhoto.groupBy({ by: ['eventId'], where: { organizationId: orgId, isPublic: true }, _count: { _all: true } });
    const events = groups.length
      ? await this.prisma.event.findMany({
          where: { id: { in: groups.map((g) => g.eventId) } },
          select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, status: true },
        })
      : [];
    const covers = groups.length
      ? await this.prisma.$queryRaw<{ eventId: string; id: string }[]>`
          SELECT DISTINCT ON ("eventId") "eventId", id FROM event_photos
          WHERE "organizationId" = ${orgId} ORDER BY "eventId", "isPublic" DESC, "createdAt" DESC`
      : [];
    const byYear = new Map<number, unknown[]>();
    for (const e of events.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())) {
      const g = groups.find((x) => x.eventId === e.id)!;
      const year = e.startDate.getUTCFullYear();
      const cover = covers.find((c) => c.eventId === e.id);
      const list = byYear.get(year) ?? [];
      list.push({
        id: e.id, name: e.name, festivalType: e.festivalType, startDate: ymd(e.startDate), endDate: ymd(e.endDate), status: e.status,
        photos: g._count._all, publicPhotos: publicCounts.find((x) => x.eventId === e.id)?._count._all ?? 0, sizeBytes: g._sum.sizeBytes ?? 0,
        coverThumbUrl: cover ? `/events/${e.id}/photos/${cover.id}/image?size=thumb` : null,
      });
      byYear.set(year, list);
    }
    return {
      usage: await this.usage(orgId),
      years: [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, events]) => ({ year, events })),
    };
  }

  async orgPhotos(orgId: string, q: OrgPhotoListQuery) {
    const { page, pageSize, skip, take } = paging(q, 48);
    const where: Prisma.EventPhotoWhereInput = { organizationId: orgId, eventId: q.eventId, isPublic: q.public ? true : undefined };
    const [rows, total] = await Promise.all([
      this.prisma.eventPhoto.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.eventPhoto.count({ where }),
    ]);
    return paged(rows.map((p) => presentPhoto(p)), total, page, pageSize);
  }
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
