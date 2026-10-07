import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GALLERY_QUOTA_BYTES } from './image-info';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Everything that counts toward a mandal's 300 MB image quota: festival photos,
 * visitor review photos and achievement images (full + thumbnail bytes each).
 * Logo and banner are small and fixed-size, so they don't count.
 * Callers that add bytes must hold the organization row lock (`SELECT … FOR UPDATE`).
 */
export async function storageUsage(db: Db, organizationId: string) {
  const [photos, reviewPhotos, achievements] = await Promise.all([
    db.eventPhoto.aggregate({ where: { organizationId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    db.reviewPhoto.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
    db.achievement.aggregate({ where: { organizationId }, _sum: { imageSizeBytes: true } }),
  ]);
  const photoBytes = photos._sum.sizeBytes ?? 0;
  const visitorPhotoBytes = reviewPhotos._sum.sizeBytes ?? 0;
  const achievementBytes = achievements._sum.imageSizeBytes ?? 0;
  return {
    usedBytes: photoBytes + visitorPhotoBytes + achievementBytes,
    quotaBytes: GALLERY_QUOTA_BYTES,
    photos: photos._count._all,
    breakdown: { photoBytes, visitorPhotoBytes, achievementBytes },
  };
}

export function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Locks the organization row: serializes every quota-consuming upload of one mandal. */
export async function lockOrg(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR UPDATE`;
}
