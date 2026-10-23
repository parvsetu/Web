import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SponsorsService } from '../sponsors/sponsors.service';
import { Public } from '../../common/auth/decorators';
import { EXPENSE_CATEGORIES } from '../../common/festival-types';
import { INDIA_STATES } from '../../common/india-locations';
import { ymd } from '../../common/time/validity';
import { presentVenue, VENUE_SELECT } from '../../common/venue';
import { ORG_BRAND_SELECT, presentOrgBrand } from '../../common/org-brand';
import { PrismaService } from '../../prisma/prisma.service';
import { LIVE_WHERE } from '../../common/event-approval';
import { FestivalCatalogService } from '../../common/catalog/festival-catalog.service';
import { CONTENT_POLICY } from '../../common/legal';
import { EventSlugService } from '../events/event-slug.service';
import { presentSalesWindow } from '../../common/booking-window';
import { citySlug } from '../seo/seo.rules';

@Public()
@Controller('public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService, private readonly sponsors: SponsorsService, private readonly catalog: FestivalCatalogService,
    private readonly slugs: EventSlugService,
  ) {}

  /**
   * Shareable festival page data (social previews, posters, promotion).
   * Only LIVE (reviewed + paid) ACTIVE / COMPLETED festivals are public; drafts stay private.
   * `:eventId` may also be the page address (slug) or an old one; `slug` in the answer is the current address.
   */
  @Get('events/:eventId')
  async event(@Param('eventId') idOrSlug: string) {
    const eventId = await this.slugs.resolve(idOrSlug);
    if (!eventId) throw new NotFoundException('Festival not found');
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['ACTIVE', 'COMPLETED'] }, ...LIVE_WHERE },
      select: {
        id: true, slug: true, name: true, festivalType: true, description: true, ...VENUE_SELECT,
        startDate: true, endDate: true, timezone: true, status: true, publicBookingEnabled: true, publicDonationsEnabled: true, volunteerRegistrationOpen: true, bookingOpensAt: true, bookingClosesAt: true,
        organization: { select: { name: true, city: true, state: true, ...ORG_BRAND_SELECT } },
        timeSlots: { where: { isActive: true }, select: { label: true, startTime: true, endTime: true, price: true }, orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!e) throw new NotFoundException('Festival not found');
    const { timeSlots, organization, bookingOpensAt, bookingClosesAt, ...rest } = e;
    return {
      ...rest,
      ...presentSalesWindow({ bookingOpensAt, bookingClosesAt }),
      organization: presentOrgBrand(organization),
      venue: presentVenue(e),
      startDate: ymd(e.startDate),
      endDate: ymd(e.endDate),
      timings: timeSlots.map((s) => ({ label: s.label, startTime: s.startTime, endTime: s.endTime, price: s.price.toFixed(2) })),
      fromPrice: timeSlots.length ? Prisma.Decimal.min(...timeSlots.map((s) => s.price)).toFixed(2) : null,
      sponsors: await this.sponsors.forEvent(e.id),
    };
  }

  /**
   * Everything search engines may index: public festivals (by page address) and live
   * mandal landing pages. Used by the site's sitemap.xml; no private data.
   */
  @Get('sitemap')
  async sitemap() {
    const now = new Date();
    const [events, landings, seo] = await Promise.all([
      this.prisma.event.findMany({
        where: { status: { in: ['ACTIVE', 'COMPLETED'] }, ...LIVE_WHERE },
        select: { id: true, slug: true, updatedAt: true, status: true, city: true, organization: { select: { city: true } } }, orderBy: { startDate: 'desc' }, take: 5000,
      }),
      this.prisma.landingPage.findMany({
        where: { enabled: true, paidUntil: { gt: now } },
        select: { updatedAt: true, organization: { select: { slug: true } } }, take: 5000,
      }),
      this.prisma.seoPage.findMany({ where: { published: true, kind: { in: ['CITY', 'CATEGORY'] } }, select: { kind: true, key: true, updatedAt: true } }),
    ]);
    // City pages: every city with a live festival, plus cities the super admin wrote a page for.
    const cityPages = new Map<string, Date | null>();
    for (const e of events) {
      const slug = citySlug(e.city || e.organization.city || '');
      if (slug && e.status === 'ACTIVE' && !cityPages.has(slug)) cityPages.set(slug, null);
    }
    const categoryPages = new Map<string, Date>();
    for (const p of seo) {
      const map = p.kind === 'CITY' ? cityPages : categoryPages;
      const prev = map.get(p.key);
      if (!prev || prev < p.updatedAt) map.set(p.key, p.updatedAt);
    }
    return {
      festivals: events.map((e) => ({ path: e.slug ?? e.id, updatedAt: e.updatedAt, upcoming: e.status === 'ACTIVE' })),
      mandals: landings.map((l) => ({ slug: l.organization.slug, updatedAt: l.updatedAt })),
      cities: [...cityPages].map(([slug, updatedAt]) => ({ slug, updatedAt })),
      categories: [...categoryPages].map(([key, updatedAt]) => ({ key, updatedAt })),
    };
  }

  /** Only what a would-be volunteer needs to pick an event — no stats, no ids beyond event/org. */
  @Get('events')
  async events() {
    const events = await this.prisma.event.findMany({
      where: { volunteerRegistrationOpen: true, status: { in: ['DRAFT', 'ACTIVE'] }, ...LIVE_WHERE },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, location: true, state: true, city: true, organization: { select: { id: true, name: true } } },
    });
    return events.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate) }));
  }

  /** Code presets + custom types the super admin added to the catalog. */
  @Get('festival-types')
  festivalTypes() {
    return this.catalog.list();
  }

  /** The content policy / declaration every registration and event submission must accept. */
  @Get('legal/content-policy')
  contentPolicy() {
    return CONTENT_POLICY;
  }

  /** States & UTs of India with their main cities, for State → City dropdowns. */
  @Get('locations')
  locations() {
    return INDIA_STATES;
  }

  @Get('expense-categories')
  expenseCategories() {
    return EXPENSE_CATEGORIES;
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}
