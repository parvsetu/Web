import { Controller, Get, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { EventApprovalStatus, EventStatus, Prisma } from '@prisma/client';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { SearchPageQuery, paged, paging, searchTerm } from '../../common/http';
import { PrismaService } from '../../prisma/prisma.service';

const WHEN = ['live', 'upcoming', 'past'] as const;
const SORTS = ['recent', 'soonest', 'name'] as const;

class DirectoryEventsQuery extends SearchPageQuery {
  @IsOptional() @IsString() @MaxLength(80) state?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) festivalType?: string;
  @IsOptional() @IsIn(Object.values(EventStatus)) status?: EventStatus;
  @IsOptional() @IsIn(Object.values(EventApprovalStatus)) approvalStatus?: EventApprovalStatus;
  @IsOptional() @IsIn(WHEN) when?: (typeof WHEN)[number];
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsIn(SORTS) sort?: (typeof SORTS)[number];
}

class CitiesQuery {
  @IsOptional() @IsString() @MaxLength(80) state?: string;
}

/** Today as a @db.Date value, by the Indian calendar (all festivals are in India). */
function todayIst(): Date {
  const d = new Date(Date.now() + 330 * 60_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Super admin "directory": every festival and mandal on the platform, searchable
 * and filterable by place, type and status, so the home screen stays usable at
 * thousands of rows. A festival's place is its venue's state/city, falling back
 * to its mandal's when the venue has none.
 */
@SuperAdminOnly()
@Controller('platform/directory')
export class PlatformDirectoryController {
  constructor(private readonly prisma: PrismaService) {}

  /** Headline counts plus the states that actually have mandals, with counts. */
  @Get('overview')
  async overview() {
    const today = todayIst();
    const [mandals, festivals, liveNow, upcoming, drafts, waitingReview, orgStates, eventStates] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.event.count(),
      this.prisma.event.count({ where: { status: 'ACTIVE', startDate: { lte: today }, endDate: { gte: today } } }),
      this.prisma.event.count({ where: { status: { in: ['ACTIVE', 'DRAFT'] }, startDate: { gt: today } } }),
      this.prisma.event.count({ where: { status: 'DRAFT' } }),
      this.prisma.event.count({ where: { approvalStatus: 'SUBMITTED' } }),
      this.prisma.organization.groupBy({ by: ['state'], _count: { _all: true } }),
      this.prisma.event.groupBy({ by: ['state'], _count: { _all: true } }),
    ]);
    const states = new Map<string, { state: string; mandals: number; festivals: number }>();
    for (const r of orgStates) if (r.state) states.set(r.state, { state: r.state, mandals: r._count._all, festivals: 0 });
    for (const r of eventStates) {
      if (!r.state) continue;
      const s = states.get(r.state) ?? { state: r.state, mandals: 0, festivals: 0 };
      s.festivals = r._count._all;
      states.set(r.state, s);
    }
    return {
      totals: { mandals, festivals, liveNow, upcoming, drafts, waitingReview },
      states: [...states.values()].sort((a, b) => b.mandals + b.festivals - (a.mandals + a.festivals) || a.state.localeCompare(b.state)),
    };
  }

  /** Cities that have mandals or festivals (optionally in one state), busiest first. */
  @Get('cities')
  async cities(@Query() q: CitiesQuery) {
    const [orgs, events] = await Promise.all([
      this.prisma.organization.groupBy({ by: ['city'], where: { state: q.state || undefined, city: { not: null } }, _count: { _all: true } }),
      this.prisma.event.groupBy({ by: ['city'], where: { state: q.state || undefined, city: { not: null } }, _count: { _all: true } }),
    ]);
    const counts = new Map<string, { city: string; count: number }>();
    for (const r of [...orgs, ...events]) {
      const name = r.city?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const c = counts.get(key) ?? { city: name, count: 0 };
      c.count += r._count._all;
      counts.set(key, c);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  }

  @Get('events')
  async events(@Query() q: DirectoryEventsQuery) {
    const { page, pageSize, skip, take } = paging(q, 20);
    const t = searchTerm(q.q);
    const today = todayIst();
    const and: Prisma.EventWhereInput[] = [];
    if (t) {
      and.push({
        OR: [
          { name: { contains: t, mode: 'insensitive' } },
          { city: { contains: t, mode: 'insensitive' } },
          { slug: { contains: t.toLowerCase() } },
          { organization: { name: { contains: t, mode: 'insensitive' } } },
        ],
      });
    }
    if (q.state) and.push({ OR: [{ state: q.state }, { state: null, organization: { state: q.state } }] });
    if (q.city) {
      const city = { equals: q.city, mode: 'insensitive' as const };
      and.push({ OR: [{ city }, { city: null, organization: { city } }] });
    }
    if (q.festivalType) and.push({ festivalType: q.festivalType });
    if (q.status) and.push({ status: q.status });
    if (q.approvalStatus) and.push({ approvalStatus: q.approvalStatus });
    if (q.organizationId) and.push({ organizationId: q.organizationId });
    if (q.when === 'live') and.push({ status: 'ACTIVE', startDate: { lte: today }, endDate: { gte: today } });
    if (q.when === 'upcoming') and.push({ status: { in: ['ACTIVE', 'DRAFT'] }, startDate: { gt: today } });
    if (q.when === 'past') and.push({ endDate: { lt: today } });
    const where: Prisma.EventWhereInput = { AND: and };
    const orderBy: Prisma.EventOrderByWithRelationInput[] =
      q.sort === 'name' ? [{ name: 'asc' }] : q.sort === 'soonest' ? [{ startDate: 'asc' }, { name: 'asc' }] : [{ startDate: 'desc' }, { name: 'asc' }];
    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where, orderBy, skip, take,
        select: {
          id: true, name: true, slug: true, festivalType: true, status: true, approvalStatus: true, startDate: true, endDate: true, city: true, state: true,
          organization: { select: { id: true, name: true, city: true, state: true } },
        },
      }),
      this.prisma.event.count({ where }),
    ]);
    const items = rows.map((e) => ({
      ...e,
      startDate: e.startDate.toISOString().slice(0, 10),
      endDate: e.endDate.toISOString().slice(0, 10),
      city: e.city ?? e.organization.city,
      state: e.state ?? e.organization.state,
    }));
    return paged(items, total, page, pageSize);
  }
}
