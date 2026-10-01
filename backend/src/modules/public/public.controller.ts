import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SponsorsService } from '../sponsors/sponsors.service';
import { Public } from '../../common/auth/decorators';
import { EXPENSE_CATEGORIES, FESTIVAL_TYPES } from '../../common/festival-types';
import { INDIA_STATES } from '../../common/india-locations';
import { ymd } from '../../common/time/validity';
import { presentVenue, VENUE_SELECT } from '../../common/venue';
import { ORG_BRAND_SELECT, presentOrgBrand } from '../../common/org-brand';
import { PrismaService } from '../../prisma/prisma.service';

@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService, private readonly sponsors: SponsorsService) {}

  /**
   * Shareable festival page data (social previews, posters, promotion).
   * Only ACTIVE / COMPLETED festivals are public; drafts stay private.
   */
  @Get('events/:eventId')
  async event(@Param('eventId') eventId: string) {
    const e = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: {
        id: true, name: true, festivalType: true, description: true, ...VENUE_SELECT,
        startDate: true, endDate: true, timezone: true, status: true, publicBookingEnabled: true, volunteerRegistrationOpen: true,
        organization: { select: { name: true, city: true, state: true, ...ORG_BRAND_SELECT } },
        timeSlots: { where: { isActive: true }, select: { label: true, startTime: true, endTime: true, price: true }, orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] },
      },
    });
    if (!e) throw new NotFoundException('Festival not found');
    const { timeSlots, organization, ...rest } = e;
    return {
      ...rest,
      organization: presentOrgBrand(organization),
      venue: presentVenue(e),
      startDate: ymd(e.startDate),
      endDate: ymd(e.endDate),
      timings: timeSlots.map((s) => ({ label: s.label, startTime: s.startTime, endTime: s.endTime, price: s.price.toFixed(2) })),
      fromPrice: timeSlots.length ? Prisma.Decimal.min(...timeSlots.map((s) => s.price)).toFixed(2) : null,
      sponsors: await this.sponsors.forEvent(e.id),
    };
  }

  /** Only what a would-be volunteer needs to pick an event — no stats, no ids beyond event/org. */
  @Get('events')
  async events() {
    const events = await this.prisma.event.findMany({
      where: { volunteerRegistrationOpen: true, status: { in: ['DRAFT', 'ACTIVE'] } },
      orderBy: { startDate: 'asc' },
      select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, location: true, state: true, city: true, organization: { select: { id: true, name: true } } },
    });
    return events.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate) }));
  }

  @Get('festival-types')
  festivalTypes() {
    return FESTIVAL_TYPES;
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
