import { BadRequestException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Artwork, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { normalizeEmail, normalizeMobile } from '../../common/identity';
import { paged, paging } from '../../common/http';
import { LIVE_WHERE } from '../../common/event-approval';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import { MAX_BANNER_BYTES, MAX_THUMB_BYTES, UploadedImageFile, imageInfo } from '../../common/images/image-info';
import { lockOrg, mb, storageUsage } from '../../common/images/quota';
import { normaliseInstagramProfile } from '../programme/programme.rules';
import { rupees, toPaise } from '../billing/billing.service';
import { CreateArtworkDto, CreateEnquiryDto, EnquiryListQuery, UpdateArtworkDto, UpdateEnquiryDto } from './art.dto';

export const MAX_ARTWORKS_PER_EVENT = 300;
const MAX_ART_IMAGE_BYTES = MAX_BANNER_BYTES;
/** Festivals whose art gallery is public (same rule as the festival page). */
const PUBLIC_EVENT = { status: { in: ['ACTIVE', 'COMPLETED'] }, ...LIVE_WHERE } satisfies Prisma.EventWhereInput;

const cm = (d: Prisma.Decimal | null) => (d === null ? null : d.toFixed(1).replace(/\.0$/, ''));

function presentPublic(a: Artwork) {
  const v = a.imageUpdatedAt?.getTime() ?? 0;
  return {
    id: a.id, title: a.title, artistName: a.artistName, artistBio: a.artistBio, artistInstagram: a.artistInstagram,
    medium: a.medium, widthCm: cm(a.widthCm), heightCm: cm(a.heightCm), depthCm: cm(a.depthCm), year: a.year, description: a.description,
    mode: a.mode, price: a.mode === 'SALE' && a.pricePaise !== null ? rupees(a.pricePaise) : null, saleStatus: a.saleStatus,
    isFeatured: a.isFeatured, imageWidth: a.imageWidth, imageHeight: a.imageHeight,
    imageUrl: a.imageKey ? `/public/artworks/${a.id}/image?v=${v}` : null,
    thumbUrl: a.imageKey ? `/public/artworks/${a.id}/image?size=thumb&v=${v}` : null,
  };
}

function presentAdmin(a: Artwork & { _count?: { enquiries: number } }, newEnquiries = 0) {
  const v = a.imageUpdatedAt?.getTime() ?? 0;
  return {
    ...presentPublic(a),
    imageUrl: a.imageKey ? `/events/${a.eventId}/artworks/${a.id}/image?v=${v}` : null,
    thumbUrl: a.imageKey ? `/events/${a.eventId}/artworks/${a.id}/image?size=thumb&v=${v}` : null,
    isPublished: a.isPublished, sortOrder: a.sortOrder, soldAt: a.soldAt, imageSizeBytes: a.imageSizeBytes,
    enquiries: a._count?.enquiries ?? 0, newEnquiries,
  };
}

/**
 * Art gallery of a festival: artworks shown only (DISPLAY) or offered for sale
 * (SALE, with a price and Available / Reserved / Sold). No money moves through
 * Parvsetu — a buyer sends an enquiry and the mandal follows up and marks the
 * piece sold. Writes and enquiries (personal data) need GALLERY_MANAGE.
 */
@Injectable()
export class ArtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORE) private readonly store: ImageStore,
  ) {}

  private async event(eventId: string) {
    const ev = await this.prisma.event.findUnique({ where: { id: eventId }, select: { id: true, organizationId: true } });
    if (!ev) throw new NotFoundException('Festival not found');
    return ev;
  }

  private async artwork(eventId: string, id: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const a = await db.artwork.findFirst({ where: { id, eventId } });
    if (!a) throw new NotFoundException('Artwork not found');
    return a;
  }

  private data(dto: UpdateArtworkDto, before?: Artwork) {
    const clean = (s: string | undefined) => (s === undefined ? undefined : s.trim() || null);
    const dec = (s: string | null | undefined) => (s === undefined ? undefined : s ? new Prisma.Decimal(s) : null);
    const mode = dto.mode ?? before?.mode ?? 'DISPLAY';
    const price = dto.price === undefined ? undefined : dto.price ? toPaise(dto.price) : null;
    const pricePaise = mode === 'DISPLAY' ? null : price === undefined ? before?.pricePaise ?? null : price;
    if (mode === 'SALE' && !pricePaise) throw new BadRequestException('Set a price for an artwork that is for sale.');
    const saleStatus = mode === 'DISPLAY' ? 'AVAILABLE' : dto.saleStatus ?? before?.saleStatus ?? 'AVAILABLE';
    const soldAt = saleStatus === 'SOLD' ? before?.soldAt ?? new Date() : null;
    return {
      title: dto.title?.trim(), artistName: dto.artistName?.trim(), artistBio: clean(dto.artistBio),
      artistInstagram: dto.artistInstagram === undefined ? undefined : normaliseInstagramProfile(dto.artistInstagram),
      medium: clean(dto.medium), widthCm: dec(dto.widthCm), heightCm: dec(dto.heightCm), depthCm: dec(dto.depthCm),
      year: dto.year === undefined ? undefined : dto.year, description: clean(dto.description),
      mode, pricePaise, saleStatus, soldAt, isFeatured: dto.isFeatured, isPublished: dto.isPublished, sortOrder: dto.sortOrder,
    } satisfies Prisma.ArtworkUncheckedUpdateInput;
  }

  async list(eventId: string) {
    const rows = await this.prisma.artwork.findMany({
      where: { eventId }, orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { enquiries: true } } },
    });
    const fresh = await this.prisma.artworkEnquiry.groupBy({ by: ['artworkId'], where: { eventId, status: 'NEW' }, _count: { _all: true } });
    const n = new Map(fresh.map((f) => [f.artworkId, f._count._all]));
    return rows.map((a) => presentAdmin(a, n.get(a.id) ?? 0));
  }

  async create(actor: RequestUser, eventId: string, dto: CreateArtworkDto) {
    const ev = await this.event(eventId);
    const data = this.data(dto);
    return this.prisma.$transaction(async (tx) => {
      if ((await tx.artwork.count({ where: { eventId } })) >= MAX_ARTWORKS_PER_EVENT) throw new BadRequestException(`A festival can show at most ${MAX_ARTWORKS_PER_EVENT} artworks.`);
      const a = await tx.artwork.create({ data: { ...data, organizationId: ev.organizationId, eventId, title: dto.title.trim(), artistName: dto.artistName.trim() } });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'artwork.created', entityType: 'Artwork', entityId: a.id, after: presentAdmin(a) }, tx);
      return presentAdmin(a);
    });
  }

  async update(actor: RequestUser, eventId: string, id: string, dto: UpdateArtworkDto) {
    const before = await this.artwork(eventId, id);
    const data = this.data(dto, before);
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.artwork.update({ where: { id }, data });
      await this.audit.log({
        organizationId: a.organizationId, eventId, actorId: actor.id, action: before.saleStatus !== a.saleStatus ? `artwork.${a.saleStatus.toLowerCase()}` : 'artwork.updated',
        entityType: 'Artwork', entityId: id, before: presentAdmin(before), after: presentAdmin(a),
      }, tx);
      return presentAdmin(a);
    });
  }

  async remove(actor: RequestUser, eventId: string, id: string) {
    const a = await this.artwork(eventId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.artwork.delete({ where: { id } });
      await this.store.delete([a.imageKey, a.thumbKey], tx);
      await this.audit.log({ organizationId: a.organizationId, eventId, actorId: actor.id, action: 'artwork.deleted', entityType: 'Artwork', entityId: id, before: presentAdmin(a) }, tx);
    });
  }

  async setImage(actor: RequestUser, eventId: string, id: string, file?: UploadedImageFile, thumb?: UploadedImageFile) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload.');
    if (file.size > MAX_ART_IMAGE_BYTES) throw new PayloadTooLargeException(`The image must be ${mb(MAX_ART_IMAGE_BYTES)} or smaller.`);
    if (thumb && thumb.size > MAX_THUMB_BYTES) throw new PayloadTooLargeException(`The thumbnail must be ${MAX_THUMB_BYTES / 1024} KB or smaller.`);
    const info = imageInfo(file.buffer, 'image');
    const thumbInfo = thumb ? imageInfo(thumb.buffer, 'thumbnail') : null;
    const size = file.size + (thumb?.size ?? 0);
    const ev = await this.event(eventId);
    return this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, ev.organizationId);
      const before = await this.artwork(eventId, id, tx);
      const { usedBytes, quotaBytes } = await storageUsage(tx, ev.organizationId);
      if (usedBytes - before.imageSizeBytes + size > quotaBytes) {
        throw new PayloadTooLargeException({
          statusCode: 413, code: 'GALLERY_QUOTA_EXCEEDED', usedBytes, quotaBytes,
          message: `Not enough photo space: ${mb(usedBytes)} of ${mb(quotaBytes)} used. Delete some photos first.`,
        });
      }
      const imageKey = await this.store.put({ prefix: `event/${eventId}/art`, organizationId: ev.organizationId, bytes: file.buffer, mimeType: info.type }, tx);
      const thumbKey = thumb && thumbInfo ? await this.store.put({ prefix: `event/${eventId}/art-thumbs`, organizationId: ev.organizationId, bytes: thumb.buffer, mimeType: thumbInfo.type }, tx) : null;
      const a = await tx.artwork.update({ where: { id }, data: { imageKey, thumbKey, imageWidth: info.width, imageHeight: info.height, imageSizeBytes: size, imageUpdatedAt: new Date() } });
      await this.store.delete([before.imageKey, before.thumbKey], tx);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'artwork.image_updated', entityType: 'Artwork', entityId: id, after: { type: info.type, width: info.width, height: info.height, sizeBytes: size } }, tx);
      return presentAdmin(a);
    }, { timeout: 20_000 });
  }

  async removeImage(actor: RequestUser, eventId: string, id: string) {
    const before = await this.artwork(eventId, id);
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.artwork.update({ where: { id }, data: { imageKey: null, thumbKey: null, imageWidth: null, imageHeight: null, imageSizeBytes: 0, imageUpdatedAt: null } });
      await this.store.delete([before.imageKey, before.thumbKey], tx);
      await this.audit.log({ organizationId: a.organizationId, eventId, actorId: actor.id, action: 'artwork.image_removed', entityType: 'Artwork', entityId: id }, tx);
      return presentAdmin(a);
    });
  }

  /** Public image: published artwork of a public festival only. */
  publicImage(id: string, size?: 'thumb' | 'full') {
    return this.image({ id, isPublished: true, event: PUBLIC_EVENT }, size);
  }

  async image(where: Prisma.ArtworkWhereInput, size: 'thumb' | 'full' = 'full') {
    const a = await this.prisma.artwork.findFirst({ where, select: { imageKey: true, thumbKey: true } });
    const key = size === 'thumb' ? a?.thumbKey ?? a?.imageKey : a?.imageKey;
    const img = key ? await this.store.get(key) : null;
    if (!img) throw new NotFoundException('No image');
    return img;
  }

  // ─── Enquiries ───────────────────────────────────────────────────────

  async enquiries(eventId: string, q: EnquiryListQuery) {
    const { page, pageSize, skip, take } = paging(q, 50);
    const where: Prisma.ArtworkEnquiryWhereInput = { eventId, status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.artworkEnquiry.findMany({ where, include: { artwork: { select: { id: true, title: true, artistName: true, pricePaise: true, saleStatus: true } } }, orderBy: [{ createdAt: 'desc' }], skip, take }),
      this.prisma.artworkEnquiry.count({ where }),
    ]);
    return paged(rows.map((e) => ({
      id: e.id, name: e.name, phone: e.phone, email: e.email, message: e.message, status: e.status, note: e.note, createdAt: e.createdAt,
      artwork: { id: e.artwork.id, title: e.artwork.title, artistName: e.artwork.artistName, price: e.artwork.pricePaise !== null ? rupees(e.artwork.pricePaise) : null, saleStatus: e.artwork.saleStatus },
    })), total, page, pageSize);
  }

  async updateEnquiry(actor: RequestUser, eventId: string, id: string, dto: UpdateEnquiryDto) {
    const e = await this.prisma.artworkEnquiry.findFirst({ where: { id, eventId } });
    if (!e) throw new NotFoundException('Enquiry not found');
    const ev = await this.event(eventId);
    await this.prisma.$transaction(async (tx) => {
      await tx.artworkEnquiry.update({ where: { id }, data: { status: dto.status, note: dto.note === undefined ? undefined : dto.note.trim() || null } });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'artwork_enquiry.updated', entityType: 'ArtworkEnquiry', entityId: id, before: { status: e.status }, after: { status: dto.status } }, tx);
    });
    return { id, status: dto.status };
  }

  // ─── Public ──────────────────────────────────────────────────────────

  async publicForEvent(eventId: string) {
    const ev = await this.prisma.event.findFirst({ where: { id: eventId, ...PUBLIC_EVENT }, select: { id: true } });
    if (!ev) throw new NotFoundException('Festival not found');
    const rows = await this.prisma.artwork.findMany({ where: { eventId, isPublished: true }, orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(presentPublic);
  }

  /** "I'm interested" in a for-sale piece. Goes to the mandal's enquiry inbox. */
  async enquire(artworkId: string, dto: CreateEnquiryDto) {
    if (dto.website) return { ok: true }; // honeypot: pretend it worked
    const a = await this.prisma.artwork.findFirst({ where: { id: artworkId, isPublished: true, event: PUBLIC_EVENT } });
    if (!a) throw new NotFoundException('Artwork not found');
    if (a.mode !== 'SALE') throw new BadRequestException({ statusCode: 400, code: 'NOT_FOR_SALE', message: 'This artwork is on display only.' });
    if (a.saleStatus === 'SOLD') throw new BadRequestException({ statusCode: 400, code: 'ARTWORK_SOLD', message: 'This artwork has already been sold.' });
    const phone = normalizeMobile(dto.phone);
    const dup = await this.prisma.artworkEnquiry.findFirst({ where: { artworkId, phone, status: { not: 'CLOSED' } }, select: { id: true } });
    if (dup) return { ok: true, duplicate: true };
    await this.prisma.$transaction(async (tx) => {
      const e = await tx.artworkEnquiry.create({
        data: { artworkId, eventId: a.eventId, name: dto.name.trim(), phone, email: dto.email ? normalizeEmail(dto.email) : null, message: dto.message?.trim() || null },
      });
      await this.audit.log({ organizationId: a.organizationId, eventId: a.eventId, action: 'artwork_enquiry.created', entityType: 'ArtworkEnquiry', entityId: e.id, after: { artwork: a.title } }, tx);
    });
    return { ok: true };
  }
}
