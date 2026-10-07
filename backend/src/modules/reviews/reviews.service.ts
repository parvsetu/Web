import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma, ReviewPhoto, ReviewStatus } from '@prisma/client';
import { createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { paged, paging, PageQuery } from '../../common/http';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import { UploadedImageFile, imageInfo } from '../../common/images/image-info';
import { lockOrg, mb, storageUsage } from '../../common/images/quota';
import { displayNameProblem, screenText } from '../../common/moderation/abuse-words';
import { LIVE_WHERE } from '../../common/event-approval';
import {
  ApproveReviewDto, ReportReviewDto, ReviewListQuery, SubmitReviewDto,
} from './reviews.dto';
import {
  MAX_DISPLAY_NAME, MAX_FEATURED_REVIEWS, MAX_REVIEW_PHOTO_BYTES, MAX_REVIEW_PHOTOS, MAX_REVIEW_TEXT, MAX_REVIEW_THUMB_BYTES,
  REVIEW_CONSENT_TEXT, REVIEW_CONSENT_VERSION, REVIEW_REPORT_HIDE_THRESHOLD, defaultDisplayName, reviewWindow,
} from './reviews.rules';

/** Festivals whose approved reviews may be shown publicly. */
const PUBLIC_EVENT: Prisma.EventWhereInput = { status: { in: ['ACTIVE', 'COMPLETED'] }, ...LIVE_WHERE };
const PUBLIC_REVIEW: Prisma.VisitorReviewWhereInput = { status: 'APPROVED', event: PUBLIC_EVENT };

const orderSelect = {
  id: true, status: true, accessKey: true, buyerName: true, eventId: true,
  event: { select: { id: true, name: true, organizationId: true, startDate: true, endDate: true, timezone: true, status: true, approvalStatus: true } },
} as const;
type OrderForReview = Prisma.PassOrderGetPayload<{ select: typeof orderSelect }>;

const reviewInclude = {
  photos: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  event: { select: { id: true, name: true } },
} satisfies Prisma.VisitorReviewInclude;
type ReviewRow = Prisma.VisitorReviewGetPayload<{ include: typeof reviewInclude }>;

/** Moderation scope: a whole mandal, or one festival (event-assigned moderators). `base` prefixes authed image URLs. */
export interface ReviewScope {
  organizationId: string;
  eventId?: string;
  base: string;
}

interface IncomingPhoto {
  file: UploadedImageFile;
  thumb?: UploadedImageFile;
  info: ReturnType<typeof imageInfo>;
  thumbInfo: ReturnType<typeof imageInfo> | null;
}

const publicPhotoUrls = (p: ReviewPhoto) => ({
  id: p.id, width: p.width, height: p.height,
  url: `/public/review-photos/${p.id}/image`, thumbUrl: `/public/review-photos/${p.id}/image?size=thumb`,
});

export function publicReview(r: ReviewRow) {
  return {
    id: r.id, rating: r.rating, text: r.text, displayName: r.displayName, featured: r.featured, createdAt: r.createdAt,
    event: { id: r.event.id, name: r.event.name },
    photos: r.photos.filter((p) => p.approved).map(publicPhotoUrls),
  };
}

/**
 * Visitor reviews, photos & selfies. Only the holder of a PAID pass order (order
 * id + accessKey, the same proof the pass page uses) can post — once per order,
 * from the festival's first day until 30 days after its last. Nothing is public
 * until the mandal approves it; public reports can auto-hide an approved review.
 * Photos go through the ImageStore and count toward the mandal's 300 MB quota.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORE) private readonly store: ImageStore,
  ) {}

  // ─── Visitor (order id + access key) ─────────────────────────────────

  private async loadOrder(orderId: string, key: string): Promise<OrderForReview> {
    const order = await this.prisma.passOrder.findUnique({ where: { id: orderId }, select: orderSelect }).catch(() => null);
    const a = Buffer.from(order?.accessKey ?? 'x'.repeat(32));
    const b = Buffer.from(key ?? '');
    if (!order || a.length !== b.length || !timingSafeEqual(a, b)) throw new NotFoundException('Booking not found');
    return order;
  }

  /** Why this order can't post (null = it can). */
  private eligibility(order: OrderForReview, now = new Date()) {
    const w = reviewWindow(order.event, now);
    const eventOpen = order.event.approvalStatus === 'LIVE' && (order.event.status === 'ACTIVE' || order.event.status === 'COMPLETED');
    const reason = order.status !== 'PAID' ? 'NOT_PAID' as const
      : !eventOpen ? 'EVENT_CLOSED' as const
      : w.state === 'NOT_STARTED' ? 'NOT_STARTED' as const
      : w.state === 'CLOSED' ? 'WINDOW_CLOSED' as const
      : null;
    return { reason, opensOn: w.opensOn, closesOn: w.closesOn };
  }

  private assertCanPost(order: OrderForReview) {
    const e = this.eligibility(order);
    if (e.reason === 'NOT_PAID') throw new ForbiddenException({ statusCode: 403, code: 'ORDER_NOT_PAID', message: 'Only visitors with a paid pass can review this festival.' });
    if (e.reason === 'EVENT_CLOSED') throw new ConflictException({ statusCode: 409, code: 'REVIEWS_CLOSED', message: 'Reviews are not open for this festival.' });
    if (e.reason === 'NOT_STARTED') throw new ConflictException({ statusCode: 409, code: 'REVIEW_NOT_OPEN', message: `Reviews open on the festival's first day (${e.opensOn}).`, opensOn: e.opensOn });
    if (e.reason === 'WINDOW_CLOSED') throw new ConflictException({ statusCode: 409, code: 'REVIEW_WINDOW_CLOSED', message: `Reviews for this festival closed on ${e.closesOn}.`, closesOn: e.closesOn });
  }

  private presentOwn(r: ReviewRow, orderId: string, key: string) {
    const k = encodeURIComponent(key);
    return {
      id: r.id, status: r.status, rating: r.rating, text: r.text, displayName: r.displayName, createdAt: r.createdAt, updatedAt: r.updatedAt,
      editable: r.status === 'PENDING',
      /** Shown to the visitor only when the mandal didn't approve it. */
      moderationNote: r.status === 'REJECTED' ? r.moderationNote : null,
      photos: r.photos.map((p) => ({
        id: p.id, approved: p.approved, width: p.width, height: p.height,
        thumbUrl: `/public/booking/orders/${orderId}/review/photos/${p.id}/image?size=thumb&k=${k}`,
        url: `/public/booking/orders/${orderId}/review/photos/${p.id}/image?k=${k}`,
      })),
    };
  }

  /** What the pass page needs: can this visitor post, and their review so far. */
  async forOrder(orderId: string, key: string) {
    const order = await this.loadOrder(orderId, key);
    const review = await this.prisma.visitorReview.findUnique({ where: { passOrderId: orderId }, include: reviewInclude });
    const e = this.eligibility(order);
    return {
      canSubmit: !review && !e.reason,
      reason: e.reason, opensOn: e.opensOn, closesOn: e.closesOn,
      event: { id: order.event.id, name: order.event.name },
      defaultDisplayName: defaultDisplayName(order.buyerName),
      consent: { version: REVIEW_CONSENT_VERSION, text: REVIEW_CONSENT_TEXT },
      limits: { maxPhotos: MAX_REVIEW_PHOTOS, maxText: MAX_REVIEW_TEXT, maxDisplayName: MAX_DISPLAY_NAME },
      review: review ? this.presentOwn(review, orderId, key) : null,
    };
  }

  private clean(dto: SubmitReviewDto) {
    if (dto.consent !== true) throw new BadRequestException({ statusCode: 400, code: 'CONSENT_REQUIRED', message: 'Please tick the box allowing the mandal to show your review.' });
    const text = (dto.text ?? '').replace(/\r\n/g, '\n').trim() || null;
    if (text && [...text].length > MAX_REVIEW_TEXT) throw new BadRequestException(`The review can be at most ${MAX_REVIEW_TEXT} characters.`);
    const displayName = dto.displayName.replace(/\s+/g, ' ').trim();
    if (!displayName || [...displayName].length > MAX_DISPLAY_NAME) throw new BadRequestException(`The display name must be 1–${MAX_DISPLAY_NAME} characters.`);
    const problem = displayNameProblem(displayName);
    if (problem) throw new BadRequestException(problem);
    const flagReasons = screenText(text, displayName);
    return { rating: dto.rating, text, displayName, flagReasons, flagged: flagReasons.length > 0 };
  }

  private checkPhotos(files: UploadedImageFile[], thumbs: UploadedImageFile[], already = 0): IncomingPhoto[] {
    if (files.length + already > MAX_REVIEW_PHOTOS) throw new BadRequestException(`Add at most ${MAX_REVIEW_PHOTOS} photos.`);
    if (thumbs.length && thumbs.length !== files.length) throw new BadRequestException('Send one thumbnail per photo (or none).');
    return files.map((file, i) => {
      if (file.size > MAX_REVIEW_PHOTO_BYTES) throw new PayloadTooLargeException(`Each photo must be ${MAX_REVIEW_PHOTO_BYTES / 1024 / 1024} MB or smaller.`);
      const thumb = thumbs[i];
      if (thumb && thumb.size > MAX_REVIEW_THUMB_BYTES) throw new PayloadTooLargeException(`Each thumbnail must be ${MAX_REVIEW_THUMB_BYTES / 1024} KB or smaller.`);
      return { file, thumb, info: imageInfo(file.buffer, 'photo'), thumbInfo: thumb ? imageInfo(thumb.buffer, 'thumbnail') : null };
    });
  }

  /** Stores the photos if they fit the quota (org row must be locked); otherwise returns why not. */
  private async storePhotos(tx: Prisma.TransactionClient, orgId: string, reviewId: string, photos: IncomingPhoto[], startOrder: number) {
    if (!photos.length) return { stored: 0, rejected: null as null | { code: string; message: string } };
    const incoming = photos.reduce((s, p) => s + p.file.size + (p.thumb?.size ?? 0), 0);
    const { usedBytes, quotaBytes } = await storageUsage(tx, orgId);
    if (usedBytes + incoming > quotaBytes) {
      return {
        stored: 0,
        rejected: { code: 'PHOTO_STORAGE_FULL', message: `Your review was saved, but the mandal's photo storage is full (${mb(usedBytes)} of ${mb(quotaBytes)}), so the photos weren't added.` },
      };
    }
    for (const [i, p] of photos.entries()) {
      const imageKey = await this.store.put({ prefix: `org/${orgId}/reviews`, organizationId: orgId, bytes: p.file.buffer, mimeType: p.info.type }, tx);
      const thumbKey = p.thumb && p.thumbInfo
        ? await this.store.put({ prefix: `org/${orgId}/review-thumbs`, organizationId: orgId, bytes: p.thumb.buffer, mimeType: p.thumbInfo.type }, tx)
        : null;
      await tx.reviewPhoto.create({
        data: {
          reviewId, organizationId: orgId, imageKey, thumbKey, mimeType: p.info.type, width: p.info.width, height: p.info.height,
          sizeBytes: p.file.size + (p.thumb?.size ?? 0), sortOrder: startOrder + i,
        },
      });
    }
    return { stored: photos.length, rejected: null };
  }

  async submit(orderId: string, dto: SubmitReviewDto, files: UploadedImageFile[] = [], thumbs: UploadedImageFile[] = []) {
    const order = await this.loadOrder(orderId, dto.k);
    this.assertCanPost(order);
    const c = this.clean(dto);
    const photos = this.checkPhotos(files, thumbs);
    const orgId = order.event.organizationId;
    let photoResult;
    try {
      photoResult = await this.prisma.$transaction(async (tx) => {
        await lockOrg(tx, orgId);
        if (await tx.visitorReview.findUnique({ where: { passOrderId: orderId }, select: { id: true } })) throw reviewExists();
        const r = await tx.visitorReview.create({
          data: {
            organizationId: orgId, eventId: order.event.id, passOrderId: orderId, ...c,
            consentVersion: REVIEW_CONSENT_VERSION, consentAt: new Date(),
          },
        });
        return this.storePhotos(tx, orgId, r.id, photos, 0);
      }, { timeout: 30_000, maxWait: 10_000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw reviewExists();
      throw e;
    }
    const review = await this.prisma.visitorReview.findUniqueOrThrow({ where: { passOrderId: orderId }, include: reviewInclude });
    return { ...this.presentOwn(review, orderId, dto.k), photosRejected: photoResult.rejected };
  }

  /** Edit while still PENDING: new text/rating/name, keep some photos, add new ones (≤ 3 in total). */
  async edit(orderId: string, dto: SubmitReviewDto, files: UploadedImageFile[] = [], thumbs: UploadedImageFile[] = []) {
    const order = await this.loadOrder(orderId, dto.k);
    this.assertCanPost(order);
    const c = this.clean(dto);
    let keep: string[] | null = null;
    if (dto.keepPhotoIds !== undefined) {
      try {
        const parsed: unknown = JSON.parse(dto.keepPhotoIds);
        if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) throw new Error();
        keep = parsed as string[];
      } catch {
        throw new BadRequestException('keepPhotoIds must be a JSON array of photo ids');
      }
    }
    const orgId = order.event.organizationId;
    const photoResult = await this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, orgId);
      const r = await tx.visitorReview.findUnique({ where: { passOrderId: orderId }, include: { photos: true } });
      if (!r) throw new NotFoundException('You haven’t posted a review for this pass yet.');
      if (r.status !== 'PENDING') throw new ConflictException({ statusCode: 409, code: 'REVIEW_LOCKED', message: 'The mandal has already looked at this review, so it can’t be changed.' });
      const kept = keep === null ? r.photos : r.photos.filter((p) => keep!.includes(p.id));
      const removed = r.photos.filter((p) => !kept.includes(p));
      const incoming = this.checkPhotos(files, thumbs, kept.length);
      if (removed.length) await tx.reviewPhoto.deleteMany({ where: { id: { in: removed.map((p) => p.id) } } });
      await tx.visitorReview.update({ where: { id: r.id }, data: { ...c, consentVersion: REVIEW_CONSENT_VERSION, consentAt: new Date() } });
      return this.storePhotos(tx, orgId, r.id, incoming, Math.max(0, ...kept.map((p) => p.sortOrder + 1)));
    }, { timeout: 30_000, maxWait: 10_000 });
    const review = await this.prisma.visitorReview.findUniqueOrThrow({ where: { passOrderId: orderId }, include: reviewInclude });
    return { ...this.presentOwn(review, orderId, dto.k), photosRejected: photoResult.rejected };
  }

  async ownPhoto(orderId: string, key: string, photoId: string, size: 'thumb' | 'full' = 'full') {
    await this.loadOrder(orderId, key);
    const p = await this.prisma.reviewPhoto.findFirst({ where: { id: photoId, review: { passOrderId: orderId } } }).catch(() => null);
    return this.bytes(p, size);
  }

  private async bytes(p: ReviewPhoto | null, size: 'thumb' | 'full') {
    const img = p ? await this.store.get(size === 'thumb' && p.thumbKey ? p.thumbKey : p.imageKey) : null;
    if (!img) throw new NotFoundException('Photo not found');
    return img;
  }

  // ─── Public ──────────────────────────────────────────────────────────

  async publicPhoto(photoId: string, size: 'thumb' | 'full' = 'full') {
    const p = await this.prisma.reviewPhoto.findFirst({ where: { id: photoId, approved: true, review: PUBLIC_REVIEW } }).catch(() => null);
    return this.bytes(p, size);
  }

  async summary(where: Prisma.VisitorReviewWhereInput) {
    const agg = await this.prisma.visitorReview.aggregate({ where: { AND: [PUBLIC_REVIEW, where] }, _avg: { rating: true }, _count: { _all: true } });
    const count = agg._count._all;
    return { average: count ? Math.round((agg._avg.rating ?? 0) * 10) / 10 : null, count };
  }

  /** Approved reviews, featured first, newest first. */
  async publicList(where: Prisma.VisitorReviewWhereInput, q: PageQuery, defaultSize = 10) {
    const { page, pageSize, skip, take } = paging(q, defaultSize);
    const w = { AND: [PUBLIC_REVIEW, where] };
    const [rows, total, summary] = await Promise.all([
      this.prisma.visitorReview.findMany({ where: w, include: reviewInclude, orderBy: [{ featured: 'desc' }, { featuredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip, take }),
      this.prisma.visitorReview.count({ where: w }),
      this.summary(where),
    ]);
    return { ...paged(rows.map(publicReview), total, page, pageSize), summary };
  }

  async publicForEvent(eventId: string, q: PageQuery) {
    const ev = await this.prisma.event.findFirst({ where: { id: eventId, ...PUBLIC_EVENT }, select: { id: true } }).catch(() => null);
    if (!ev) throw new NotFoundException('Festival not found');
    return this.publicList({ eventId }, q, 6);
  }

  /** The visitor photo wall: approved photos on approved reviews. */
  async visitorPhotos(organizationId: string, q: PageQuery, defaultSize = 12) {
    const { page, pageSize, skip, take } = paging(q, defaultSize);
    const where: Prisma.ReviewPhotoWhereInput = { organizationId, approved: true, review: PUBLIC_REVIEW };
    const [rows, total] = await Promise.all([
      this.prisma.reviewPhoto.findMany({
        where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take,
        include: { review: { select: { displayName: true, rating: true, event: { select: { id: true, name: true } } } } },
      }),
      this.prisma.reviewPhoto.count({ where }),
    ]);
    return paged(rows.map((p) => ({ ...publicPhotoUrls(p), displayName: p.review.displayName, event: p.review.event, createdAt: p.createdAt })), total, page, pageSize);
  }

  /** Public "Report" on an approved review. One per reporter (hashed IP); the threshold auto-hides it. */
  async report(reviewId: string, ip: string | undefined, dto: ReportReviewDto) {
    const r = await this.prisma.visitorReview.findFirst({ where: { id: reviewId, ...PUBLIC_REVIEW }, select: { id: true } }).catch(() => null);
    if (!r) throw new NotFoundException('Review not found');
    const reporterHash = createHash('sha256').update(`${process.env.JWT_SECRET ?? ''}|review-report|${ip ?? 'unknown'}`).digest('hex');
    await this.prisma.$transaction(async (tx) => {
      const ins = await tx.reviewReport.createMany({ data: [{ reviewId, reason: dto.reason, note: dto.note?.trim() || null, reporterHash }], skipDuplicates: true });
      if (!ins.count) return;
      await tx.$queryRaw`SELECT id FROM visitor_reviews WHERE id = ${reviewId} FOR UPDATE`;
      const open = await tx.reviewReport.count({ where: { reviewId, resolvedAt: null } });
      const cur = await tx.visitorReview.findUniqueOrThrow({ where: { id: reviewId } });
      const hide = open >= REVIEW_REPORT_HIDE_THRESHOLD && cur.status === 'APPROVED';
      await tx.visitorReview.update({
        where: { id: reviewId },
        data: { reportCount: open, ...(hide ? { status: 'HIDDEN', autoHiddenAt: new Date(), featured: false, featuredAt: null } : {}) },
      });
      if (hide) {
        await this.audit.log({
          organizationId: cur.organizationId, eventId: cur.eventId, action: 'review.auto_hidden', entityType: 'VisitorReview', entityId: reviewId,
          before: { status: cur.status }, after: { status: 'HIDDEN', reports: open }, reason: `${open} visitor reports`,
        }, tx);
      }
    });
    return { received: true };
  }

  // ─── Mandal moderation ───────────────────────────────────────────────

  private scopeWhere(s: ReviewScope): Prisma.VisitorReviewWhereInput {
    return { organizationId: s.organizationId, ...(s.eventId ? { eventId: s.eventId } : {}) };
  }

  private presentForMandal(r: ReviewRow & { moderatedBy?: { id: string; name: string } | null }, s: ReviewScope) {
    return {
      id: r.id, eventId: r.eventId, event: r.event, passOrderId: r.passOrderId,
      rating: r.rating, text: r.text, displayName: r.displayName, status: r.status,
      flagged: r.flagged, flagReasons: r.flagReasons, featured: r.featured,
      reportCount: r.reportCount, autoHidden: !!r.autoHiddenAt, autoHiddenAt: r.autoHiddenAt,
      moderationNote: r.moderationNote, moderatedAt: r.moderatedAt, moderatedBy: r.moderatedBy ?? null,
      consentVersion: r.consentVersion, consentAt: r.consentAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
      photos: r.photos.map((p) => ({
        id: p.id, approved: p.approved, width: p.width, height: p.height, sizeBytes: p.sizeBytes,
        url: `${s.base}/reviews/photos/${p.id}/image`, thumbUrl: `${s.base}/reviews/photos/${p.id}/image?size=thumb`,
      })),
    };
  }

  async counts(s: ReviewScope) {
    const where = this.scopeWhere(s);
    const [groups, flaggedPending, reported, featured] = await Promise.all([
      this.prisma.visitorReview.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.visitorReview.count({ where: { ...where, status: 'PENDING', flagged: true } }),
      this.prisma.visitorReview.count({ where: { ...where, OR: [{ reportCount: { gt: 0 } }, { autoHiddenAt: { not: null } }] } }),
      this.prisma.visitorReview.count({ where: { organizationId: s.organizationId, featured: true } }),
    ]);
    const by = (st: ReviewStatus) => groups.find((g) => g.status === st)?._count._all ?? 0;
    return {
      PENDING: by('PENDING'), APPROVED: by('APPROVED'), REJECTED: by('REJECTED'), HIDDEN: by('HIDDEN'),
      flaggedPending, reported, featured, maxFeatured: MAX_FEATURED_REVIEWS,
    };
  }

  async list(s: ReviewScope, q: ReviewListQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const where: Prisma.VisitorReviewWhereInput = {
      ...this.scopeWhere(s), status: q.status, flagged: q.flagged, ...(q.eventId && !s.eventId ? { eventId: q.eventId } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.visitorReview.findMany({
        where, include: reviewInclude, skip, take,
        orderBy: q.status === 'PENDING' ? [{ flagged: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] : [{ featured: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.visitorReview.count({ where }),
      this.counts(s),
    ]);
    const modIds = [...new Set(rows.map((r) => r.moderatedById).filter((x): x is string => !!x))];
    const mods = modIds.length ? await this.prisma.user.findMany({ where: { id: { in: modIds } }, select: { id: true, name: true } }) : [];
    return {
      ...paged(rows.map((r) => this.presentForMandal({ ...r, moderatedBy: mods.find((m) => m.id === r.moderatedById) ?? null }, s)), total, page, pageSize),
      counts,
    };
  }

  /** Locks and loads a review inside the scope (404 outside it). */
  private async lockReview(tx: Prisma.TransactionClient, s: ReviewScope, id: string) {
    const found = await tx.visitorReview.findFirst({ where: { id, ...this.scopeWhere(s) }, select: { id: true } }).catch(() => null);
    if (!found) throw new NotFoundException('Review not found');
    await tx.$queryRaw`SELECT id FROM visitor_reviews WHERE id = ${id} FOR UPDATE`;
    return tx.visitorReview.findUniqueOrThrow({ where: { id }, include: reviewInclude });
  }

  private async reload(s: ReviewScope, id: string) {
    const r = await this.prisma.visitorReview.findUniqueOrThrow({ where: { id }, include: reviewInclude });
    const moderatedBy = r.moderatedById ? await this.prisma.user.findUnique({ where: { id: r.moderatedById }, select: { id: true, name: true } }) : null;
    return this.presentForMandal({ ...r, moderatedBy }, s);
  }

  private snapshot(r: { status: ReviewStatus; featured: boolean; reportCount: number }) {
    return { status: r.status, featured: r.featured, reportCount: r.reportCount };
  }

  /** Publish (also restores a hidden one and clears its open reports). */
  async approve(actorId: string, s: ReviewScope, id: string, dto: ApproveReviewDto) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockReview(tx, s, id);
      if (dto.photoIds) {
        const own = new Set(r.photos.map((p) => p.id));
        if (!dto.photoIds.every((p) => own.has(p))) throw new BadRequestException('Those photos are not on this review.');
      }
      for (const p of r.photos) {
        const approved = dto.photoIds ? dto.photoIds.includes(p.id) : true;
        if (approved !== p.approved) await tx.reviewPhoto.update({ where: { id: p.id }, data: { approved } });
      }
      await tx.reviewReport.updateMany({ where: { reviewId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
      const after = await tx.visitorReview.update({
        where: { id },
        data: { status: 'APPROVED', moderatedById: actorId, moderatedAt: new Date(), moderationNote: dto.note?.trim() || null, reportCount: 0, autoHiddenAt: null },
      });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: r.status === 'HIDDEN' ? 'review.restored' : 'review.approved',
        entityType: 'VisitorReview', entityId: id, before: this.snapshot(r),
        after: { ...this.snapshot(after), photosPublished: dto.photoIds?.length ?? r.photos.length }, reason: dto.note,
      }, tx);
    });
    return this.reload(s, id);
  }

  async reject(actorId: string, s: ReviewScope, id: string, note?: string) {
    return this.setStatus(actorId, s, id, 'REJECTED', ['PENDING', 'HIDDEN', 'APPROVED'], 'review.rejected', note);
  }

  /** Take an approved review off the public pages (it can be approved again later). */
  async hide(actorId: string, s: ReviewScope, id: string, note?: string) {
    return this.setStatus(actorId, s, id, 'HIDDEN', ['APPROVED'], 'review.hidden', note);
  }

  private async setStatus(actorId: string, s: ReviewScope, id: string, to: ReviewStatus, from: ReviewStatus[], action: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockReview(tx, s, id);
      if (r.status === to) return;
      if (!from.includes(r.status)) {
        throw new ConflictException({ statusCode: 409, code: 'REVIEW_STATE', message: to === 'HIDDEN' ? 'Only an approved review can be hidden.' : `A ${r.status.toLowerCase()} review can't be changed that way.` });
      }
      const after = await tx.visitorReview.update({
        where: { id },
        data: { status: to, featured: false, featuredAt: null, moderatedById: actorId, moderatedAt: new Date(), moderationNote: note?.trim() || null },
      });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action, entityType: 'VisitorReview', entityId: id,
        before: this.snapshot(r), after: this.snapshot(after), reason: note,
      }, tx);
    });
    return this.reload(s, id);
  }

  /** Featured reviews show first on the landing page (max MAX_FEATURED_REVIEWS per mandal). */
  async feature(actorId: string, s: ReviewScope, id: string, featured: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, s.organizationId);
      const r = await this.lockReview(tx, s, id);
      if (r.featured === featured) return;
      if (featured) {
        if (r.status !== 'APPROVED') throw new ConflictException({ statusCode: 409, code: 'REVIEW_STATE', message: 'Approve the review before featuring it.' });
        const n = await tx.visitorReview.count({ where: { organizationId: s.organizationId, featured: true } });
        if (n >= MAX_FEATURED_REVIEWS) {
          throw new ConflictException({ statusCode: 409, code: 'FEATURE_LIMIT', message: `You can feature at most ${MAX_FEATURED_REVIEWS} reviews. Un-feature one first.` });
        }
      }
      await tx.visitorReview.update({ where: { id }, data: { featured, featuredAt: featured ? new Date() : null } });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: featured ? 'review.featured' : 'review.unfeatured',
        entityType: 'VisitorReview', entityId: id, before: { featured: r.featured }, after: { featured },
      }, tx);
    });
    return this.reload(s, id);
  }

  async setPhotoApproved(actorId: string, s: ReviewScope, id: string, photoId: string, approved: boolean) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockReview(tx, s, id);
      const p = r.photos.find((x) => x.id === photoId);
      if (!p) throw new NotFoundException('Photo not found');
      if (p.approved === approved) return;
      await tx.reviewPhoto.update({ where: { id: photoId }, data: { approved } });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: approved ? 'review.photo_approved' : 'review.photo_unpublished',
        entityType: 'ReviewPhoto', entityId: photoId, before: { approved: p.approved }, after: { approved, reviewId: id },
      }, tx);
    });
    return this.reload(s, id);
  }

  /** Deletes the photo and its bytes (frees quota). */
  async removePhoto(actorId: string, s: ReviewScope, id: string, photoId: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockReview(tx, s, id);
      const p = r.photos.find((x) => x.id === photoId);
      if (!p) throw new NotFoundException('Photo not found');
      await tx.reviewPhoto.delete({ where: { id: photoId } });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: 'review.photo_removed', entityType: 'ReviewPhoto', entityId: photoId,
        before: { reviewId: id, sizeBytes: p.sizeBytes, approved: p.approved },
      }, tx);
    });
    return this.reload(s, id);
  }

  async remove(actorId: string, s: ReviewScope, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.lockReview(tx, s, id);
      await this.deleteReview(tx, r);
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: 'review.deleted', entityType: 'VisitorReview', entityId: id,
        before: { ...this.snapshot(r), rating: r.rating, displayName: r.displayName, text: r.text, photos: r.photos.length },
      }, tx);
    });
  }

  /** Photos' bytes go via the review_photos AFTER DELETE trigger (DB store); delete explicitly too for other stores. */
  private async deleteReview(tx: Prisma.TransactionClient, r: ReviewRow) {
    const keys = r.photos.flatMap((p) => [p.imageKey, p.thumbKey]);
    await tx.visitorReview.delete({ where: { id: r.id } });
    await this.store.delete(keys, tx);
  }

  async mandalPhoto(s: ReviewScope, photoId: string, size: 'thumb' | 'full' = 'full') {
    const p = await this.prisma.reviewPhoto.findFirst({ where: { id: photoId, review: this.scopeWhere(s) } }).catch(() => null);
    return this.bytes(p, size);
  }

  // ─── Platform (super admin) ──────────────────────────────────────────

  async reported(q: PageQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const where: Prisma.VisitorReviewWhereInput = { OR: [{ reportCount: { gt: 0 } }, { autoHiddenAt: { not: null } }] };
    const [rows, total] = await Promise.all([
      this.prisma.visitorReview.findMany({
        where, skip, take, orderBy: [{ reportCount: 'desc' }, { updatedAt: 'desc' }],
        include: {
          ...reviewInclude,
          organization: { select: { id: true, name: true, slug: true } },
          reports: { where: { resolvedAt: null }, orderBy: { createdAt: 'desc' }, take: 10, select: { reason: true, note: true, createdAt: true } },
        },
      }),
      this.prisma.visitorReview.count({ where }),
    ]);
    const s: ReviewScope = { organizationId: '', base: '/platform' };
    return paged(rows.map((r) => ({ ...this.presentForMandal(r, s), organization: r.organization, reports: r.reports })), total, page, pageSize);
  }

  private async platformLock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM visitor_reviews WHERE id = ${id} FOR UPDATE`;
    const r = await tx.visitorReview.findUnique({ where: { id }, include: reviewInclude }).catch(() => null);
    if (!r) throw new NotFoundException('Review not found');
    return r;
  }

  /** Reports were unfounded: clear them and put an auto-hidden review back. */
  async platformRestore(actorId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.platformLock(tx, id);
      await tx.reviewReport.updateMany({ where: { reviewId: id, resolvedAt: null }, data: { resolvedAt: new Date() } });
      const back = r.autoHiddenAt && r.status === 'HIDDEN';
      await tx.visitorReview.update({ where: { id }, data: { reportCount: 0, autoHiddenAt: null, ...(back ? { status: 'APPROVED' } : {}) } });
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: 'review.reports_dismissed', entityType: 'VisitorReview', entityId: id,
        before: this.snapshot(r), after: { status: back ? 'APPROVED' : r.status, reportCount: 0 },
      }, tx);
    });
    return { ok: true };
  }

  async platformRemove(actorId: string, id: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await this.platformLock(tx, id);
      await this.deleteReview(tx, r);
      await this.audit.log({
        organizationId: r.organizationId, eventId: r.eventId, actorId, action: 'review.removed_by_platform', entityType: 'VisitorReview', entityId: id,
        before: { ...this.snapshot(r), rating: r.rating, displayName: r.displayName, text: r.text, photos: r.photos.length }, reason,
      }, tx);
    });
  }

  async platformPhoto(photoId: string, size: 'thumb' | 'full' = 'full') {
    const p = await this.prisma.reviewPhoto.findUnique({ where: { id: photoId } }).catch(() => null);
    return this.bytes(p, size);
  }

  /** For the landing page payload: summary + the first few cards (featured first). */
  async landingBlock(organizationId: string) {
    const list = await this.publicList({ organizationId }, { page: 1, pageSize: 6 });
    const photos = await this.visitorPhotos(organizationId, { page: 1, pageSize: 12 });
    return {
      reviews: { average: list.summary.average, count: list.summary.count, items: list.items, total: list.total },
      visitorPhotos: { items: photos.items, total: photos.total },
    };
  }
}

function reviewExists() {
  return new ConflictException({ statusCode: 409, code: 'REVIEW_EXISTS', message: 'You have already reviewed this booking. You can edit it while it is waiting for approval.' });
}
