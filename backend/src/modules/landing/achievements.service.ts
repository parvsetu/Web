import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Achievement, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import { MAX_BANNER_BYTES, MAX_THUMB_BYTES, UploadedImageFile, imageInfo } from '../../common/images/image-info';
import { lockOrg, mb, storageUsage } from '../../common/images/quota';
import { CreateAchievementDto, UpdateAchievementDto } from './landing.dto';

export const ACHIEVEMENT_ICONS = ['TROPHY', 'MEDAL', 'STAR', 'RIBBON', 'CERTIFICATE', 'CROWN'] as const;
export type AchievementIcon = (typeof ACHIEVEMENT_ICONS)[number];
export const MAX_ACHIEVEMENTS = 50;
export const MAX_ACHIEVEMENT_IMAGE_BYTES = MAX_BANNER_BYTES;

/** Default order: newest year first (undated last), then newest added. A mandal's own order (sortOrder 1..n) wins once set. */
export const ACHIEVEMENT_ORDER: Prisma.AchievementOrderByWithRelationInput[] = [
  { sortOrder: 'asc' }, { year: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' },
];

export function publicAchievement(a: Achievement) {
  const v = a.imageUpdatedAt?.getTime();
  return {
    id: a.id, title: a.title, year: a.year, awardedBy: a.awardedBy, description: a.description, icon: a.icon,
    imageUrl: a.imageKey ? `/public/achievements/${a.id}/image?v=${v}` : null,
    thumbUrl: a.imageKey ? `/public/achievements/${a.id}/image?size=thumb&v=${v}` : null,
  };
}

function present(a: Achievement) {
  return { ...publicAchievement(a), isVisible: a.isVisible, sortOrder: a.sortOrder, imageSizeBytes: a.imageSizeBytes, createdAt: a.createdAt, updatedAt: a.updatedAt };
}

const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : v.replace(/\s+/g, ' ').trim() || null);

/** Trophies & recognition on the mandal's landing page. Images count toward the 300 MB quota. */
@Injectable()
export class AchievementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Inject(IMAGE_STORE) private readonly store: ImageStore) {}

  async list(organizationId: string) {
    const rows = await this.prisma.achievement.findMany({ where: { organizationId }, orderBy: ACHIEVEMENT_ORDER });
    return { items: rows.map(present), max: MAX_ACHIEVEMENTS, customOrder: rows.some((r) => r.sortOrder !== 0) };
  }

  async publicFor(organizationId: string) {
    const rows = await this.prisma.achievement.findMany({ where: { organizationId, isVisible: true }, orderBy: ACHIEVEMENT_ORDER });
    return rows.map(publicAchievement);
  }

  private async find(organizationId: string, id: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const a = await db.achievement.findFirst({ where: { id, organizationId } }).catch(() => null);
    if (!a) throw new NotFoundException('Achievement not found');
    return a;
  }

  async create(actorId: string, organizationId: string, dto: CreateAchievementDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, organizationId);
      const rows = await tx.achievement.findMany({ where: { organizationId }, select: { sortOrder: true } });
      if (rows.length >= MAX_ACHIEVEMENTS) throw new BadRequestException(`You can add at most ${MAX_ACHIEVEMENTS} achievements.`);
      // Once the mandal has its own order, a new one goes to the end (it can be moved); otherwise the default order places it.
      const custom = rows.some((r) => r.sortOrder !== 0);
      const a = await tx.achievement.create({
        data: {
          organizationId, title: clean(dto.title)!, year: dto.year ?? null, awardedBy: clean(dto.awardedBy) ?? null,
          description: dto.description?.trim() || null, icon: dto.icon ?? 'TROPHY', isVisible: dto.isVisible ?? true,
          sortOrder: custom ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0,
        },
      });
      await this.audit.log({ organizationId, actorId, action: 'achievement.created', entityType: 'Achievement', entityId: a.id, after: present(a) }, tx);
      return present(a);
    });
  }

  async update(actorId: string, organizationId: string, id: string, dto: UpdateAchievementDto) {
    const before = await this.find(organizationId, id);
    if (dto.title !== undefined && !clean(dto.title)) throw new BadRequestException('The title can’t be empty.');
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.achievement.update({
        where: { id },
        data: {
          title: dto.title === undefined ? undefined : clean(dto.title)!,
          year: dto.year, awardedBy: clean(dto.awardedBy),
          description: dto.description === undefined ? undefined : dto.description?.trim() || null,
          icon: dto.icon, isVisible: dto.isVisible,
        },
      });
      await this.audit.log({ organizationId, actorId, action: 'achievement.updated', entityType: 'Achievement', entityId: id, before: present(before), after: present(a) }, tx);
      return present(a);
    });
  }

  /** Saves the mandal's own order: ids in display order (must be exactly this mandal's achievements). */
  async reorder(actorId: string, organizationId: string, ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, organizationId);
      const rows = await tx.achievement.findMany({ where: { organizationId }, select: { id: true } });
      const unique = new Set(ids);
      if (unique.size !== ids.length || unique.size !== rows.length || !rows.every((r) => unique.has(r.id))) {
        throw new BadRequestException('Send every achievement of this mandal exactly once, in the new order.');
      }
      for (const [i, id] of ids.entries()) await tx.achievement.update({ where: { id }, data: { sortOrder: i + 1 } });
      await this.audit.log({ organizationId, actorId, action: 'achievement.reordered', entityType: 'Achievement', after: { ids } }, tx);
    });
    return this.list(organizationId);
  }

  async remove(actorId: string, organizationId: string, id: string) {
    const a = await this.find(organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.achievement.delete({ where: { id } });
      await this.store.delete([a.imageKey, a.thumbKey], tx);
      await this.audit.log({ organizationId, actorId, action: 'achievement.deleted', entityType: 'Achievement', entityId: id, before: present(a) }, tx);
    });
  }

  /** Photo of the trophy/certificate (resized on the phone), plus an optional ~400 px thumbnail. */
  async setImage(actorId: string, organizationId: string, id: string, file: UploadedImageFile | undefined, thumb: UploadedImageFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload.');
    if (file.size > MAX_ACHIEVEMENT_IMAGE_BYTES) throw new PayloadTooLargeException(`The image must be ${MAX_ACHIEVEMENT_IMAGE_BYTES / 1024 / 1024} MB or smaller.`);
    if (thumb && thumb.size > MAX_THUMB_BYTES) throw new PayloadTooLargeException(`The thumbnail must be ${MAX_THUMB_BYTES / 1024} KB or smaller.`);
    const info = imageInfo(file.buffer, 'image');
    const thumbInfo = thumb ? imageInfo(thumb.buffer, 'thumbnail') : null;
    const size = file.size + (thumb?.size ?? 0);
    return this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, organizationId);
      const before = await this.find(organizationId, id, tx);
      const { usedBytes, quotaBytes } = await storageUsage(tx, organizationId);
      if (usedBytes - before.imageSizeBytes + size > quotaBytes) {
        throw new PayloadTooLargeException({
          statusCode: 413, code: 'GALLERY_QUOTA_EXCEEDED', usedBytes, quotaBytes,
          message: `Not enough photo space: ${mb(usedBytes)} of ${mb(quotaBytes)} used. Delete some photos first.`,
        });
      }
      const imageKey = await this.store.put({ prefix: `org/${organizationId}/achievements`, organizationId, bytes: file.buffer, mimeType: info.type }, tx);
      const thumbKey = thumb && thumbInfo ? await this.store.put({ prefix: `org/${organizationId}/achievement-thumbs`, organizationId, bytes: thumb.buffer, mimeType: thumbInfo.type }, tx) : null;
      const a = await tx.achievement.update({
        where: { id }, data: { imageKey, thumbKey, imageMimeType: info.type, imageSizeBytes: size, imageUpdatedAt: new Date() },
      });
      await this.store.delete([before.imageKey, before.thumbKey], tx);
      await this.audit.log({
        organizationId, actorId, action: 'achievement.image_updated', entityType: 'Achievement', entityId: id,
        after: { type: info.type, width: info.width, height: info.height, sizeBytes: size },
      }, tx);
      return present(a);
    }, { timeout: 20_000 });
  }

  async removeImage(actorId: string, organizationId: string, id: string) {
    const before = await this.find(organizationId, id);
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.achievement.update({ where: { id }, data: { imageKey: null, thumbKey: null, imageMimeType: null, imageSizeBytes: 0, imageUpdatedAt: null } });
      if (before.imageKey) {
        await this.store.delete([before.imageKey, before.thumbKey], tx);
        await this.audit.log({ organizationId, actorId, action: 'achievement.image_removed', entityType: 'Achievement', entityId: id }, tx);
      }
      return present(a);
    });
  }

  async image(id: string, size: 'thumb' | 'full' = 'full', opts: { organizationId?: string; publicOnly?: boolean }) {
    const a = await this.prisma.achievement.findFirst({
      where: { id, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}), ...(opts.publicOnly ? { isVisible: true } : {}) },
    }).catch(() => null);
    const key = size === 'thumb' && a?.thumbKey ? a.thumbKey : a?.imageKey;
    const img = key ? await this.store.get(key) : null;
    if (!img) throw new NotFoundException('Image not found');
    return img;
  }
}
