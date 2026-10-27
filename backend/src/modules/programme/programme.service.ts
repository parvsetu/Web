import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma, ProgrammeGuest, ProgrammeItem } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { RequestUser } from '../../common/auth/request-user';
import { IMAGE_STORE, ImageStore } from '../../common/images/image-store';
import { GALLERY_QUOTA_BYTES, MAX_BANNER_BYTES, MAX_LOGO_BYTES, UploadedImageFile, imageInfo } from '../../common/images/image-info';
import { lockOrg, mb, storageUsage } from '../../common/images/quota';
import { LIVE_WHERE } from '../../common/event-approval';
import { dateOnly, ymd } from '../../common/time/validity';
import { PassesService } from '../passes/passes.service';
import { PassRefundsService } from '../passes/pass-refunds.service';
import { CreateProgrammeItemDto, ProgrammeGuestDto, UpdateProgrammeItemDto, UpsertProgrammeDayDto } from './programme.dto';
import { MAX_ITEMS_PER_EVENT, festivalDates, normaliseInstagramProfile, normaliseVideoUrl, videoLink } from './programme.rules';

/** Posters are banner-sized; artist photos logo-sized. */
const MAX_POSTER_BYTES = MAX_BANNER_BYTES;
const MAX_GUEST_PHOTO_BYTES = MAX_LOGO_BYTES;

/** Festivals whose programme may be shown publicly (same rule as the festival page). */
const PUBLIC_EVENT_WHERE = { status: { in: ['ACTIVE', 'COMPLETED'] }, ...LIVE_WHERE } satisfies Prisma.EventWhereInput;

type ItemWithGuests = ProgrammeItem & { guests: ProgrammeGuest[] };

const ORDER: Prisma.ProgrammeItemOrderByWithRelationInput[] = [{ date: 'asc' }, { startTime: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }];
const GUEST_ORDER: Prisma.ProgrammeGuestOrderByWithRelationInput[] = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

function guestOut(g: ProgrammeGuest) {
  return {
    id: g.id, name: g.name, role: g.role, bio: g.bio, instagramUrl: g.instagramUrl,
    photoUrl: g.photoKey ? `/public/programme/guests/${g.id}/photo?v=${g.photoUpdatedAt?.getTime() ?? 0}` : null,
  };
}

/** Public shape of one item (no publish flag / sort order / storage sizes). */
function publicItem(i: ItemWithGuests) {
  return {
    id: i.id, date: ymd(i.date), startTime: i.startTime, endTime: i.endTime, title: i.title, category: i.category,
    description: i.description, setting: i.setting, stage: i.stage, language: i.language, ageLimit: i.ageLimit,
    video: videoLink(i.videoUrl),
    posterUrl: i.posterKey ? `/public/programme/items/${i.id}/poster?v=${i.posterUpdatedAt?.getTime() ?? 0}` : null,
    isHeadline: i.isHeadline, status: i.status, statusNote: i.statusNote,
    /** Sold as its own ticket on the booking page. */
    ticket: i.ticketed && i.endTime ? { price: i.ticketPrice.toFixed(2) } : null,
    guests: i.guests.map(guestOut),
  };
}

/** Organiser shape: images come from the authorised route, so drafts preview before going public. */
function adminItem(i: ItemWithGuests) {
  const base = `/events/${i.eventId}/programme/images`;
  const pub = publicItem(i);
  return {
    ...pub, videoUrl: i.videoUrl, isPublished: i.isPublished, sortOrder: i.sortOrder,
    ticketed: i.ticketed, ticketPrice: i.ticketPrice.toFixed(2), ticketCapacity: i.ticketCapacity,
    posterUrl: i.posterKey ? `${base}/poster/${i.id}?v=${i.posterUpdatedAt?.getTime() ?? 0}` : null,
    guests: i.guests.map((g, n) => ({ ...pub.guests[n], photoUrl: g.photoKey ? `${base}/photo/${g.id}?v=${g.photoUpdatedAt?.getTime() ?? 0}` : null })),
  };
}

const TICKET_NEEDS_END = 'Add an end time to sell tickets — the ticket is valid from start to end.';

const clean = (s: string | null | undefined) => (s === undefined ? undefined : s?.trim() || null);

/**
 * Day-by-day festival programme: who performs / which puja / which competition
 * on which day. Writes need EVENT_UPDATE on the festival; the public view is
 * read-only and limited to published items of public festivals.
 */
@Injectable()
export class ProgrammeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(IMAGE_STORE) private readonly store: ImageStore,
    private readonly passes: PassesService,
    private readonly refunds: PassRefundsService,
  ) {}

  private async event(eventId: string) {
    const ev = await this.prisma.event.findUnique({
      where: { id: eventId }, select: { id: true, organizationId: true, startDate: true, endDate: true, timezone: true },
    });
    if (!ev) throw new NotFoundException('Festival not found');
    return { ...ev, start: ymd(ev.startDate), end: ymd(ev.endDate) };
  }

  private assertInRange(ev: { start: string; end: string }, date: string) {
    dateOnly(date);
    if (date < ev.start || date > ev.end) throw new BadRequestException(`Pick a date within the festival (${ev.start} to ${ev.end}).`);
  }

  private async item(eventId: string, itemId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const it = await db.programmeItem.findFirst({ where: { id: itemId, eventId }, include: { guests: { orderBy: GUEST_ORDER } } });
    if (!it) throw new NotFoundException('Programme item not found');
    return it;
  }

  /** People holding (or holding a pending order for) a ticket to this item. */
  private async ticketsSold(tx: Prisma.TransactionClient, itemId: string) {
    await tx.$queryRaw`SELECT id FROM programme_items WHERE id = ${itemId} FOR UPDATE`;
    const [issued, held] = await Promise.all([
      tx.token.aggregate({ where: { programmeItemId: itemId, status: { not: 'CANCELLED' } }, _sum: { visitorCount: true } }),
      tx.passOrder.aggregate({ where: { programmeItemId: itemId, status: 'PENDING', expiresAt: { gt: new Date() } }, _sum: { visitorCount: true } }),
    ]);
    return (issued._sum.visitorCount ?? 0) + (held._sum.visitorCount ?? 0);
  }

  // ─── Organiser side ──────────────────────────────────────────────────

  async adminView(eventId: string) {
    const ev = await this.event(eventId);
    const [days, items] = await Promise.all([
      this.prisma.programmeDay.findMany({ where: { eventId } }),
      this.prisma.programmeItem.findMany({ where: { eventId }, orderBy: ORDER, include: { guests: { orderBy: GUEST_ORDER } } }),
    ]);
    const sold = new Map(
      (await this.prisma.token.groupBy({ by: ['programmeItemId'], where: { eventId, programmeItemId: { not: null }, status: { not: 'CANCELLED' } }, _sum: { visitorCount: true } }))
        .map((r) => [r.programmeItemId as string, r._sum.visitorCount ?? 0]),
    );
    const dayMap = new Map(days.map((d) => [ymd(d.date), d]));
    const dates = festivalDates(ev.start, ev.end);
    // Items left outside the range after the festival dates moved still show (flagged) so they can be fixed.
    const outside = [...new Set(items.map((i) => ymd(i.date)).filter((d) => !dates.includes(d)))];
    return {
      startDate: ev.start, endDate: ev.end, timezone: ev.timezone,
      days: [...dates, ...outside.sort()].map((date) => ({
        date, inRange: dates.includes(date), title: dayMap.get(date)?.title ?? null, subtitle: dayMap.get(date)?.subtitle ?? null,
        items: items.filter((i) => ymd(i.date) === date).map((i) => ({ ...adminItem(i), ticketsSold: sold.get(i.id) ?? 0 })),
      })),
    };
  }

  async upsertDay(actor: RequestUser, eventId: string, date: string, dto: UpsertProgrammeDayDto) {
    const ev = await this.event(eventId);
    this.assertInRange(ev, date);
    const title = clean(dto.title) ?? null;
    const subtitle = clean(dto.subtitle) ?? null;
    return this.prisma.$transaction(async (tx) => {
      const where = { eventId_date: { eventId, date: dateOnly(date) } };
      if (!title && !subtitle) await tx.programmeDay.deleteMany({ where: { eventId, date: dateOnly(date) } });
      else await tx.programmeDay.upsert({ where, create: { eventId, date: dateOnly(date), title, subtitle }, update: { title, subtitle } });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.day_updated', entityType: 'ProgrammeDay', entityId: date, after: { title, subtitle } }, tx);
      return { date, title, subtitle };
    });
  }

  private itemData(dto: UpdateProgrammeItemDto) {
    const endTime = dto.endTime === undefined ? undefined : dto.endTime || null;
    return {
      date: dto.date === undefined ? undefined : dateOnly(dto.date),
      startTime: dto.startTime, endTime,
      title: dto.title?.trim(), category: dto.category,
      description: clean(dto.description), setting: dto.setting === undefined ? undefined : dto.setting ?? null,
      stage: clean(dto.stage), language: clean(dto.language), ageLimit: clean(dto.ageLimit),
      videoUrl: dto.videoUrl === undefined ? undefined : normaliseVideoUrl(dto.videoUrl),
      isHeadline: dto.isHeadline, status: dto.status,
      statusNote: dto.status === 'SCHEDULED' ? null : clean(dto.statusNote),
      isPublished: dto.isPublished, sortOrder: dto.sortOrder,
      ticketed: dto.ticketed,
      ticketPrice: dto.ticketPrice === undefined ? undefined : new Prisma.Decimal(dto.ticketPrice),
      ticketCapacity: dto.ticketCapacity === undefined ? undefined : dto.ticketCapacity ?? null,
    } satisfies Prisma.ProgrammeItemUncheckedUpdateInput;
  }

  private guestRows(guests: ProgrammeGuestDto[]) {
    return guests.map((g, i) => ({
      id: g.id, name: g.name.trim(), role: g.role?.trim() || null, bio: g.bio?.trim() || null,
      instagramUrl: normaliseInstagramProfile(g.instagramUrl), sortOrder: i,
    }));
  }

  async create(actor: RequestUser, eventId: string, dto: CreateProgrammeItemDto) {
    const ev = await this.event(eventId);
    this.assertInRange(ev, dto.date);
    if (dto.endTime && dto.endTime === dto.startTime) throw new BadRequestException('Start and end time cannot be the same.');
    if (dto.ticketed && !dto.endTime) throw new BadRequestException(TICKET_NEEDS_END);
    const data = this.itemData(dto);
    const guests = this.guestRows(dto.guests ?? []).map(({ id: _id, ...g }) => g);
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.programmeItem.count({ where: { eventId } });
      if (count >= MAX_ITEMS_PER_EVENT) throw new BadRequestException(`A festival can have at most ${MAX_ITEMS_PER_EVENT} programme items.`);
      const it = await tx.programmeItem.create({
        data: { ...data, eventId, date: dateOnly(dto.date), startTime: dto.startTime, title: dto.title.trim(), guests: { create: guests } },
        include: { guests: { orderBy: GUEST_ORDER } },
      });
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.item_created', entityType: 'ProgrammeItem', entityId: it.id, after: adminItem(it) }, tx);
      return adminItem(it);
    });
  }

  async update(actor: RequestUser, eventId: string, itemId: string, dto: UpdateProgrammeItemDto) {
    const ev = await this.event(eventId);
    const before = await this.item(eventId, itemId);
    if (dto.date !== undefined) this.assertInRange(ev, dto.date);
    const start = dto.startTime ?? before.startTime;
    const end = dto.endTime === undefined ? before.endTime : dto.endTime || null;
    if (end && end === start) throw new BadRequestException('Start and end time cannot be the same.');
    if ((dto.ticketed ?? before.ticketed) && !end) throw new BadRequestException(TICKET_NEEDS_END);
    const data = this.itemData(dto);
    const guests = dto.guests ? this.guestRows(dto.guests) : null;
    if (guests) {
      const known = new Set(before.guests.map((g) => g.id));
      if (guests.some((g) => g.id && !known.has(g.id))) throw new BadRequestException('A guest in the list does not belong to this item.');
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      if (guests) {
        const keep = new Set(guests.filter((g) => g.id).map((g) => g.id as string));
        const dropped = before.guests.filter((g) => !keep.has(g.id));
        if (dropped.length) {
          await tx.programmeGuest.deleteMany({ where: { id: { in: dropped.map((g) => g.id) } } });
          await this.store.delete(dropped.map((g) => g.photoKey), tx);
        }
        for (const g of guests) {
          const { id, ...rest } = g;
          if (id) await tx.programmeGuest.update({ where: { id }, data: rest });
          else await tx.programmeGuest.create({ data: { ...rest, itemId } });
        }
      }
      // Sold tickets carry this date and time on their QR: they can't move, and capacity can't drop below them.
      const sold = await this.ticketsSold(tx, itemId);
      if (sold > 0) {
        const moved = (dto.date !== undefined && dto.date !== ymd(before.date)) || start !== before.startTime || end !== before.endTime;
        if (moved) throw new ConflictException({ code: 'TICKETS_SOLD', message: `${sold} ticket(s) are already booked for this programme, so its date and time can't change. Cancel it and add a new one instead.` });
        const cap = dto.ticketCapacity === undefined ? before.ticketCapacity : dto.ticketCapacity ?? null;
        if (cap !== null && cap < sold) throw new BadRequestException(`${sold} ticket(s) are already booked; the limit can't be lower than that.`);
      }
      await tx.programmeItem.update({ where: { id: itemId }, data });
      const after = await this.item(eventId, itemId, tx);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.item_updated', entityType: 'ProgrammeItem', entityId: itemId, before: adminItem(before), after: adminItem(after) }, tx);
      return adminItem(after);
    });
    // A cancelled programme takes its tickets with it: paid bookings are refunded in full, unpaid
    // checkouts closed, desk tickets cancelled. Runs on every save while Cancelled (idempotent).
    if (saved.status !== 'CANCELLED') return saved;
    const cancellation = await this.refunds.cancelForProgramme(actor.id, eventId, itemId, saved.title, (id) => this.passes.closeOrder(id, 'FAILED'));
    return { ...saved, cancellation };
  }

  async remove(actor: RequestUser, eventId: string, itemId: string) {
    const ev = await this.event(eventId);
    const it = await this.item(eventId, itemId);
    await this.prisma.$transaction(async (tx) => {
      if (await tx.passOrder.count({ where: { programmeItemId: itemId } })) {
        throw new ConflictException({ code: 'TICKETS_SOLD', message: 'Tickets have been booked for this programme, so it can’t be deleted. Mark it Cancelled instead — visitors will see the note.' });
      }
      await tx.programmeItem.delete({ where: { id: itemId } });
      await this.store.delete([it.posterKey, ...it.guests.map((g) => g.photoKey)], tx);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.item_deleted', entityType: 'ProgrammeItem', entityId: itemId, before: adminItem(it) }, tx);
    });
  }

  /** Copies every item (and its guests, without photos/posters) from one day to another. */
  async copyDay(actor: RequestUser, eventId: string, from: string, to: string) {
    const ev = await this.event(eventId);
    this.assertInRange(ev, from);
    this.assertInRange(ev, to);
    if (from === to) throw new BadRequestException('Pick a different day to copy to.');
    const source = await this.prisma.programmeItem.findMany({ where: { eventId, date: dateOnly(from) }, orderBy: ORDER, include: { guests: { orderBy: GUEST_ORDER } } });
    if (!source.length) throw new BadRequestException('That day has no programme to copy.');
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.programmeItem.count({ where: { eventId } });
      if (count + source.length > MAX_ITEMS_PER_EVENT) throw new BadRequestException(`A festival can have at most ${MAX_ITEMS_PER_EVENT} programme items.`);
      for (const s of source) {
        await tx.programmeItem.create({
          data: {
            eventId, date: dateOnly(to), startTime: s.startTime, endTime: s.endTime, title: s.title, category: s.category,
            description: s.description, setting: s.setting, stage: s.stage, language: s.language, ageLimit: s.ageLimit,
            videoUrl: s.videoUrl, isHeadline: false, isPublished: false, sortOrder: s.sortOrder,
            ticketed: s.ticketed, ticketPrice: s.ticketPrice, ticketCapacity: s.ticketCapacity,
            guests: { create: s.guests.map((g) => ({ name: g.name, role: g.role, bio: g.bio, instagramUrl: g.instagramUrl, sortOrder: g.sortOrder })) },
          },
        });
      }
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.day_copied', entityType: 'ProgrammeDay', entityId: to, after: { from, to, items: source.length } }, tx);
      return { copied: source.length };
    });
  }

  // ─── Images (count toward the mandal's image quota) ──────────────────

  private async putImage(
    actor: RequestUser, eventId: string, file: UploadedImageFile | undefined, kind: 'poster' | 'photo', max: number,
    apply: (tx: Prisma.TransactionClient, key: string, size: number) => Promise<{ oldKey: string | null; oldSize: number; entityId: string }>,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose an image to upload.');
    if (file.size > max) throw new PayloadTooLargeException(`The ${kind} must be ${mb(max)} or smaller.`);
    const info = imageInfo(file.buffer, kind);
    const ev = await this.event(eventId);
    return this.prisma.$transaction(async (tx) => {
      await lockOrg(tx, ev.organizationId);
      const key = await this.store.put({ prefix: `event/${eventId}/programme/${kind}`, organizationId: ev.organizationId, bytes: file.buffer, mimeType: info.type }, tx);
      const { oldKey, oldSize, entityId } = await apply(tx, key, file.size);
      const { usedBytes } = await storageUsage(tx, ev.organizationId);
      if (usedBytes > GALLERY_QUOTA_BYTES) {
        throw new PayloadTooLargeException({
          statusCode: 413, code: 'GALLERY_QUOTA_EXCEEDED',
          message: `Not enough image space: this ${kind} needs ${mb(file.size - oldSize)} more and the mandal's ${mb(GALLERY_QUOTA_BYTES)} is used up. Delete some photos first.`,
        });
      }
      await this.store.delete([oldKey], tx);
      await this.audit.log({
        organizationId: ev.organizationId, eventId, actorId: actor.id, action: `programme.${kind}_updated`,
        entityType: kind === 'poster' ? 'ProgrammeItem' : 'ProgrammeGuest', entityId, after: { type: info.type, width: info.width, height: info.height, sizeBytes: file.size },
      }, tx);
    }, { timeout: 20_000 });
  }

  async setPoster(actor: RequestUser, eventId: string, itemId: string, file: UploadedImageFile | undefined) {
    const it = await this.item(eventId, itemId);
    await this.putImage(actor, eventId, file, 'poster', MAX_POSTER_BYTES, async (tx, key, size) => {
      await tx.programmeItem.update({ where: { id: itemId }, data: { posterKey: key, posterSizeBytes: size, posterUpdatedAt: new Date() } });
      return { oldKey: it.posterKey, oldSize: it.posterSizeBytes, entityId: itemId };
    });
    return adminItem(await this.item(eventId, itemId));
  }

  async removePoster(actor: RequestUser, eventId: string, itemId: string) {
    const ev = await this.event(eventId);
    const it = await this.item(eventId, itemId);
    await this.prisma.$transaction(async (tx) => {
      await tx.programmeItem.update({ where: { id: itemId }, data: { posterKey: null, posterSizeBytes: 0, posterUpdatedAt: null } });
      await this.store.delete([it.posterKey], tx);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.poster_removed', entityType: 'ProgrammeItem', entityId: itemId }, tx);
    });
    return adminItem(await this.item(eventId, itemId));
  }

  private async guest(eventId: string, itemId: string, guestId: string) {
    const g = await this.prisma.programmeGuest.findFirst({ where: { id: guestId, itemId, item: { eventId } } });
    if (!g) throw new NotFoundException('Guest not found');
    return g;
  }

  async setGuestPhoto(actor: RequestUser, eventId: string, itemId: string, guestId: string, file: UploadedImageFile | undefined) {
    const g = await this.guest(eventId, itemId, guestId);
    await this.putImage(actor, eventId, file, 'photo', MAX_GUEST_PHOTO_BYTES, async (tx, key, size) => {
      await tx.programmeGuest.update({ where: { id: guestId }, data: { photoKey: key, photoSizeBytes: size, photoUpdatedAt: new Date() } });
      return { oldKey: g.photoKey, oldSize: g.photoSizeBytes, entityId: guestId };
    });
    return adminItem(await this.item(eventId, itemId));
  }

  async removeGuestPhoto(actor: RequestUser, eventId: string, itemId: string, guestId: string) {
    const ev = await this.event(eventId);
    const g = await this.guest(eventId, itemId, guestId);
    await this.prisma.$transaction(async (tx) => {
      await tx.programmeGuest.update({ where: { id: guestId }, data: { photoKey: null, photoSizeBytes: 0, photoUpdatedAt: null } });
      await this.store.delete([g.photoKey], tx);
      await this.audit.log({ organizationId: ev.organizationId, eventId, actorId: actor.id, action: 'programme.photo_removed', entityType: 'ProgrammeGuest', entityId: guestId }, tx);
    });
    return adminItem(await this.item(eventId, itemId));
  }

  // ─── Public ──────────────────────────────────────────────────────────

  /** Published programme of a public festival; empty days are left out. */
  async publicView(eventId: string) {
    const ev = await this.prisma.event.findFirst({ where: { id: eventId, ...PUBLIC_EVENT_WHERE }, select: { startDate: true, endDate: true, timezone: true } });
    if (!ev) throw new NotFoundException('Festival not found');
    const start = ymd(ev.startDate);
    const end = ymd(ev.endDate);
    const range = { gte: ev.startDate, lte: ev.endDate };
    const [days, items] = await Promise.all([
      this.prisma.programmeDay.findMany({ where: { eventId, date: range } }),
      this.prisma.programmeItem.findMany({ where: { eventId, isPublished: true, date: range }, orderBy: ORDER, include: { guests: { orderBy: GUEST_ORDER } } }),
    ]);
    const dayMap = new Map(days.map((d) => [ymd(d.date), d]));
    const out = items.map(publicItem);
    const dates = festivalDates(start, end);
    return {
      startDate: start, endDate: end, timezone: ev.timezone,
      days: dates
        .map((date, i) => ({ date, dayNumber: i + 1, title: dayMap.get(date)?.title ?? null, subtitle: dayMap.get(date)?.subtitle ?? null, items: out.filter((x) => x.date === date) }))
        .filter((d) => d.items.length > 0),
      /** Star line-up: guests of headline items that aren't cancelled, in date order. */
      headliners: out
        .filter((x) => x.isHeadline && x.status !== 'CANCELLED')
        .flatMap((x) => (x.guests.length ? x.guests : [null]).map((g) => ({
          itemId: x.id, date: x.date, startTime: x.startTime, title: x.title, category: x.category,
          name: g?.name ?? x.title, role: g?.role ?? null, photoUrl: g?.photoUrl ?? x.posterUrl,
        }))),
    };
  }

  async publicPoster(itemId: string) {
    const it = await this.prisma.programmeItem.findFirst({ where: { id: itemId, isPublished: true, event: PUBLIC_EVENT_WHERE }, select: { posterKey: true } });
    const img = it?.posterKey ? await this.store.get(it.posterKey) : null;
    if (!img) throw new NotFoundException('No poster');
    return img;
  }

  async publicGuestPhoto(guestId: string) {
    const g = await this.prisma.programmeGuest.findFirst({ where: { id: guestId, item: { isPublished: true, event: PUBLIC_EVENT_WHERE } }, select: { photoKey: true } });
    const img = g?.photoKey ? await this.store.get(g.photoKey) : null;
    if (!img) throw new NotFoundException('No photo');
    return img;
  }

  /** Organiser preview of images on unpublished items / non-live festivals. */
  async adminImage(eventId: string, kind: 'poster' | 'photo', id: string) {
    const key = kind === 'poster'
      ? (await this.prisma.programmeItem.findFirst({ where: { id, eventId }, select: { posterKey: true } }))?.posterKey
      : (await this.prisma.programmeGuest.findFirst({ where: { id, item: { eventId } }, select: { photoKey: true } }))?.photoKey;
    const img = key ? await this.store.get(key) : null;
    if (!img) throw new NotFoundException('No image');
    return img;
  }
}
