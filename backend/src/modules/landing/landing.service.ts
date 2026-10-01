import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LandingPage, LandingPurchase, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { paged, paging, PageQuery } from '../../common/http';
import { orgImageUrls } from '../../common/org-brand';
import { todayIn, ymd } from '../../common/time/validity';
import { BillingService, rupees } from '../billing/billing.service';
import { demoPaymentsEnabled } from '../passes/pass-gateways';
import { SponsorsService } from '../sponsors/sponsors.service';
import { publicPhoto } from '../gallery/gallery.service';
import { GrantLandingDto, UpdateLandingPageDto } from './landing.dto';
import { extendPaidUntil, landingState, socialUrl, whatsappNumber } from './landing.rules';

type Db = Prisma.TransactionClient | PrismaService;

const PUBLIC_EVENT_STATUSES = ['ACTIVE', 'COMPLETED'] as const;
const DEFAULT_PHOTOS = 12;

function presentContent(lp: LandingPage | null) {
  return {
    enabled: lp?.enabled ?? true,
    headline: lp?.headline ?? null, about: lp?.about ?? null, highlights: lp?.highlights ?? [],
    contactPhone: lp?.contactPhone ?? null, contactEmail: lp?.contactEmail ?? null,
    instagramUrl: lp?.instagramUrl ?? null, facebookUrl: lp?.facebookUrl ?? null, youtubeUrl: lp?.youtubeUrl ?? null,
    whatsappNumber: lp?.whatsappNumber ?? null,
    featuredEventIds: lp?.featuredEventIds ?? [], photoIds: lp?.photoIds ?? [], themeColor: lp?.themeColor ?? 'saffron',
  };
}

function presentPurchase(p: LandingPurchase) {
  return {
    id: p.id, amount: rupees(p.amountPaise), years: p.years, status: p.status, provider: p.paymentProvider, paymentReference: p.paymentReference,
    paidUntil: p.paidUntil, paidAt: p.paidAt, expiresAt: p.expiresAt, createdAt: p.createdAt,
  };
}

/**
 * Paid mandal landing page at /m/<slug>. A yearly fee (platform default or a
 * per-mandal override set by the super admin) is paid through the demo
 * gateway, exactly like a credit recharge. paidUntil only ever moves here:
 * a confirmed purchase (serialized on the purchase row, then the page row)
 * or an audited super-admin grant/revoke.
 */
@Injectable()
export class LandingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly sponsors: SponsorsService, private readonly billing: BillingService) {}

  async yearlyPricePaise(organizationId: string, db: Db = this.prisma) {
    return (await this.billing.rates(db, organizationId)).landingPagePricePaise;
  }

  // ─── Mandal ──────────────────────────────────────────────────────────

  async status(organizationId: string) {
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { slug: true, landingPage: true } });
    const lp = org.landingPage;
    const price = await this.yearlyPricePaise(organizationId);
    const purchases = await this.prisma.landingPurchase.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 5 });
    return {
      state: landingState(lp), paidUntil: lp?.paidUntil ?? null, price: rupees(price),
      slug: org.slug, publicPath: `/m/${org.slug}`, demoPayments: demoPaymentsEnabled(),
      content: presentContent(lp), purchases: purchases.map(presentPurchase),
    };
  }

  async update(actorId: string, organizationId: string, dto: UpdateLandingPageDto) {
    const data: Prisma.LandingPageUncheckedUpdateInput = {
      enabled: dto.enabled,
      headline: dto.headline === undefined ? undefined : dto.headline || null,
      about: dto.about === undefined ? undefined : dto.about.replace(/\r\n/g, '\n').trim() || null,
      highlights: dto.highlights?.map((h) => h.trim()).filter(Boolean),
      contactPhone: dto.contactPhone === undefined ? undefined : dto.contactPhone || null,
      contactEmail: dto.contactEmail === undefined ? undefined : dto.contactEmail?.toLowerCase() || null,
      instagramUrl: dto.instagramUrl === undefined ? undefined : socialUrl('instagramUrl', dto.instagramUrl),
      facebookUrl: dto.facebookUrl === undefined ? undefined : socialUrl('facebookUrl', dto.facebookUrl),
      youtubeUrl: dto.youtubeUrl === undefined ? undefined : socialUrl('youtubeUrl', dto.youtubeUrl),
      whatsappNumber: dto.whatsappNumber === undefined ? undefined : whatsappNumber(dto.whatsappNumber),
      themeColor: dto.themeColor,
    };
    if (dto.featuredEventIds) {
      const ids = [...new Set(dto.featuredEventIds)];
      const n = await this.prisma.event.count({ where: { id: { in: ids }, organizationId } });
      if (n !== ids.length) throw new BadRequestException('Featured festivals must belong to this mandal.');
      data.featuredEventIds = ids;
    }
    if (dto.photoIds) {
      const ids = [...new Set(dto.photoIds)];
      const n = await this.prisma.eventPhoto.count({ where: { id: { in: ids }, organizationId, isPublic: true } });
      if (n !== ids.length) throw new BadRequestException('Only this mandal’s public photos can be shown on the landing page.');
      data.photoIds = ids;
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.landingPage.findUnique({ where: { organizationId } });
      const after = await tx.landingPage.upsert({
        where: { organizationId },
        create: { ...(data as Prisma.LandingPageUncheckedCreateInput), organizationId },
        update: data,
      });
      await this.audit.log({
        organizationId, actorId, action: 'landing.updated', entityType: 'LandingPage', entityId: organizationId,
        before: presentContent(before), after: presentContent(after),
      }, tx);
      return presentContent(after);
    });
  }

  async startPurchase(actorId: string, organizationId: string) {
    const pricePaise = await this.yearlyPricePaise(organizationId);
    if (pricePaise <= 0) throw new BadRequestException('The landing page fee is not set. Please contact the platform admin.');
    const p = await this.prisma.landingPurchase.create({
      data: {
        organizationId, amountPaise: pricePaise, years: 1, paymentProvider: 'demo', providerOrderId: `demo_${randomBytes(8).toString('hex')}`,
        createdById: actorId, expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });
    return presentPurchase(p);
  }

  /** Demo checkout result. Idempotent; serialized on the purchase row, then the landing page row. */
  async completePurchase(actorId: string, organizationId: string, purchaseId: string, outcome: 'success' | 'fail') {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM landing_purchases WHERE id = ${purchaseId} AND "organizationId" = ${organizationId} FOR UPDATE`;
      if (!rows.length) throw new NotFoundException('Payment not found');
      const p = await tx.landingPurchase.findUniqueOrThrow({ where: { id: purchaseId } });
      if (p.status === 'PAID') return;
      if (p.status !== 'PENDING') throw new ConflictException({ message: 'This payment is no longer open.', code: 'PAYMENT_CLOSED' });
      if (p.expiresAt <= new Date()) {
        await tx.landingPurchase.update({ where: { id: p.id }, data: { status: 'EXPIRED' } });
        throw new ConflictException({ message: 'This payment expired. Please start again.', code: 'PAYMENT_EXPIRED' });
      }
      if (outcome === 'fail') {
        await tx.landingPurchase.update({ where: { id: p.id }, data: { status: 'FAILED' } });
        return;
      }
      const lp = await this.lockPage(tx, organizationId);
      const paidUntil = extendPaidUntil(lp.paidUntil, p.years);
      const ref = `demo_pay_${randomBytes(6).toString('hex')}`;
      await tx.landingPage.update({ where: { organizationId }, data: { paidUntil, totalPaidPaise: { increment: p.amountPaise } } });
      await tx.landingPurchase.update({ where: { id: p.id }, data: { status: 'PAID', paidAt: new Date(), paymentReference: ref, paidUntil } });
      await this.audit.log({
        organizationId, actorId, action: 'landing.purchased', entityType: 'LandingPurchase', entityId: p.id,
        before: { paidUntil: lp.paidUntil }, after: { paidUntil, amount: rupees(p.amountPaise) },
      }, tx);
    });
    return presentPurchase(await this.prisma.landingPurchase.findUniqueOrThrow({ where: { id: purchaseId } }));
  }

  private async lockPage(tx: Prisma.TransactionClient, organizationId: string) {
    await tx.$executeRaw`INSERT INTO landing_pages ("organizationId", "updatedAt") VALUES (${organizationId}, now()) ON CONFLICT ("organizationId") DO NOTHING`;
    await tx.$queryRaw`SELECT "organizationId" FROM landing_pages WHERE "organizationId" = ${organizationId} FOR UPDATE`;
    return tx.landingPage.findUniqueOrThrow({ where: { organizationId } });
  }

  // ─── Super admin ─────────────────────────────────────────────────────

  async grant(actorId: string, organizationId: string, dto: GrantLandingDto) {
    if (!dto.years === !dto.until) throw new BadRequestException('Send either years or until.');
    await this.assertOrg(organizationId);
    await this.prisma.$transaction(async (tx) => {
      const lp = await this.lockPage(tx, organizationId);
      const paidUntil = dto.until ? new Date(`${dto.until}T23:59:59.999Z`) : extendPaidUntil(lp.paidUntil, dto.years!);
      if (paidUntil <= new Date()) throw new BadRequestException('The new end date must be in the future.');
      await tx.landingPage.update({ where: { organizationId }, data: { paidUntil } });
      await this.audit.log({
        organizationId, actorId, action: 'landing.granted', entityType: 'LandingPage', entityId: organizationId,
        before: { paidUntil: lp.paidUntil }, after: { paidUntil }, reason: dto.reason,
      }, tx);
    });
    return this.status(organizationId);
  }

  async revoke(actorId: string, organizationId: string, reason: string) {
    await this.assertOrg(organizationId);
    await this.prisma.$transaction(async (tx) => {
      const lp = await this.lockPage(tx, organizationId);
      const paidUntil = lp.paidUntil && lp.paidUntil > new Date() ? new Date() : lp.paidUntil;
      await tx.landingPage.update({ where: { organizationId }, data: { paidUntil } });
      await this.audit.log({
        organizationId, actorId, action: 'landing.revoked', entityType: 'LandingPage', entityId: organizationId,
        before: { paidUntil: lp.paidUntil }, after: { paidUntil }, reason,
      }, tx);
    });
    return this.status(organizationId);
  }

  private async assertOrg(id: string) {
    if (!(await this.prisma.organization.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Mandal not found');
  }

  async purchases(q: PageQuery & { organizationId?: string }) {
    const { page, pageSize, skip, take } = paging(q);
    const where: Prisma.LandingPurchaseWhereInput = { organizationId: q.organizationId };
    const [rows, total] = await Promise.all([
      this.prisma.landingPurchase.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { organization: { select: { name: true } } } }),
      this.prisma.landingPurchase.count({ where }),
    ]);
    return paged(rows.map((r) => ({ ...presentPurchase(r), organization: { id: r.organizationId, name: r.organization.name } })), total, page, pageSize);
  }

  // ─── Public ──────────────────────────────────────────────────────────

  /** The public page. 404 unless paid up and enabled — unless `preview` (the mandal's own editor). */
  async publicPage(slug: string, preview = false) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true, city: true, state: true, address: true, logoUpdatedAt: true, bannerUpdatedAt: true, landingPage: true },
    });
    if (!org || (!preview && landingState(org.landingPage) !== 'ACTIVE')) throw new NotFoundException('This page is not available.');
    const lp = presentContent(org.landingPage);
    const today = todayIn('Asia/Kolkata');
    const events = await this.prisma.event.findMany({
      where: { organizationId: org.id, status: { in: [...PUBLIC_EVENT_STATUSES] } },
      orderBy: { startDate: 'asc' },
      select: {
        id: true, name: true, festivalType: true, description: true, location: true, city: true, startDate: true, endDate: true, status: true,
        publicBookingEnabled: true, timeSlots: { where: { isActive: true }, select: { price: true } },
      },
    });
    const card = (e: (typeof events)[number]) => ({
      id: e.id, name: e.name, festivalType: e.festivalType, description: e.description, location: e.location, city: e.city,
      startDate: ymd(e.startDate), endDate: ymd(e.endDate), status: e.status,
      bookable: e.status === 'ACTIVE' && e.publicBookingEnabled && ymd(e.endDate) >= today,
      fromPrice: e.timeSlots.length ? Prisma.Decimal.min(...e.timeSlots.map((s) => s.price)).toFixed(2) : null,
    });
    const isUpcoming = (e: (typeof events)[number]) => e.status === 'ACTIVE' && ymd(e.endDate) >= today;
    const upcomingAll = events.filter(isUpcoming);
    const upcoming = lp.featuredEventIds.length ? upcomingAll.filter((e) => lp.featuredEventIds.includes(e.id)) : upcomingAll;
    const pastByYear = new Map<number, ReturnType<typeof card>[]>();
    for (const e of events.filter((x) => !isUpcoming(x)).reverse().slice(0, 40)) {
      const y = e.startDate.getUTCFullYear();
      pastByYear.set(y, [...(pastByYear.get(y) ?? []), card(e)]);
    }

    const photoWhere: Prisma.EventPhotoWhereInput = { organizationId: org.id, isPublic: true, event: { status: { in: [...PUBLIC_EVENT_STATUSES] } } };
    let photos;
    if (lp.photoIds.length) {
      const rows = await this.prisma.eventPhoto.findMany({ where: { ...photoWhere, id: { in: lp.photoIds } } });
      photos = lp.photoIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
    } else {
      photos = await this.prisma.eventPhoto.findMany({ where: photoWhere, orderBy: { createdAt: 'desc' }, take: DEFAULT_PHOTOS });
    }

    return {
      slug: org.slug, preview: preview && landingState(org.landingPage) !== 'ACTIVE',
      organization: { id: org.id, name: org.name, city: org.city, state: org.state, address: org.address, ...orgImageUrls(org) },
      theme: lp.themeColor, headline: lp.headline, about: lp.about, highlights: lp.highlights,
      contact: { phone: lp.contactPhone, email: lp.contactEmail },
      social: {
        instagram: lp.instagramUrl, facebook: lp.facebookUrl, youtube: lp.youtubeUrl,
        whatsapp: lp.whatsappNumber ? `https://wa.me/${lp.whatsappNumber}` : null,
      },
      upcoming: upcoming.map(card),
      past: [...pastByYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, list]) => ({ year, events: list })),
      photos: photos.map(publicPhoto),
      sponsors: await this.sponsors.forOrg(org.id),
    };
  }
}
