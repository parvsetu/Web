import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GALLERY_QUOTA_BYTES } from './image-info';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Everything that counts toward a mandal's 300 MB image quota: festival photos,
 * visitor review photos, approved Instagram photos, achievement images (full + thumbnail bytes each) and
 * programme posters / artist photos.
 * Logo and banner are small and fixed-size, so they don't count.
 * Callers that add bytes must hold the organization row lock (`SELECT … FOR NO KEY UPDATE` — it doesn't
 * collide with the FOR KEY SHARE locks that inserting rows referencing the org takes).
 */
export async function storageUsage(db: Db, organizationId: string) {
  const [photos, reviewPhotos, achievements, instagram, posters, guestPhotos] = await Promise.all([
    db.eventPhoto.aggregate({ where: { organizationId }, _sum: { sizeBytes: true }, _count: { _all: true } }),
    db.reviewPhoto.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
    db.achievement.aggregate({ where: { organizationId }, _sum: { imageSizeBytes: true } }),
    db.instagramMedia.aggregate({ where: { organizationId }, _sum: { sizeBytes: true } }),
    db.programmeItem.aggregate({ where: { event: { organizationId } }, _sum: { posterSizeBytes: true } }),
    db.programmeGuest.aggregate({ where: { item: { event: { organizationId } } }, _sum: { photoSizeBytes: true } }),
  ]);
  const photoBytes = photos._sum.sizeBytes ?? 0;
  const visitorPhotoBytes = reviewPhotos._sum.sizeBytes ?? 0;
  const achievementBytes = achievements._sum.imageSizeBytes ?? 0;
  const instagramBytes = instagram._sum.sizeBytes ?? 0;
  const programmeBytes = (posters._sum.posterSizeBytes ?? 0) + (guestPhotos._sum.photoSizeBytes ?? 0);
  return {
    usedBytes: photoBytes + visitorPhotoBytes + achievementBytes + instagramBytes + programmeBytes,
    quotaBytes: GALLERY_QUOTA_BYTES,
    photos: photos._count._all,
    breakdown: { photoBytes, visitorPhotoBytes, achievementBytes, instagramBytes, programmeBytes },
  };
}

export function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Locks the organization row: serializes every quota-consuming upload of one mandal. */
export async function lockOrg(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId} FOR NO KEY UPDATE`;
}
