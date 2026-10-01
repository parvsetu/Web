import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/auth/decorators';
import { FESTIVAL_TYPES } from '../../common/festival-types';
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
      select: { id: true, name: true, festivalType: true, startDate: true, endDate: true, location: true, organization: { select: { id: true, name: true } } },
    });
    return events.map((e) => ({ ...e, startDate: ymd(e.startDate), endDate: ymd(e.endDate) }));
  }

  @Get('festival-types')
  festivalTypes() {
    return FESTIVAL_TYPES;
  }

  @Get('health')
  health() {
    return { ok: true };
  }
}
