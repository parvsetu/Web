import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/decorators';
import { EXPENSE_CATEGORIES, FESTIVAL_TYPES } from '../../common/festival-types';
import { INDIA_STATES } from '../../common/india-locations';
import { ymd } from '../../common/time/validity';
import { PrismaService } from '../../prisma/prisma.service';

@Public()
@Controller('public')
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

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
