import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { RequireAnyEventPermission, RequireEventPermission, RequireLiveEvent } from '../../common/access/permission.guard';
import {
  AssignHeatsDto, CancelEntryDto, CheckInDto, CreateCompetitionDto, CreateEntryDto, DemoPayEntryDto, EntryKeyQuery, EntryListQuery, ResultDto, UpdateCompetitionDto,
} from './competitions.dto';
import { CompetitionsService } from './competitions.service';

/** Entry / payment attempts per minute per client (lifted in tests). */
const ENTRY_LIMIT = Number(process.env.COMPETITION_ENTRY_RATE_LIMIT_PER_MIN ?? 10);

/** Organiser side. Set-up, entries (personal data) and results need EVENT_UPDATE; check-in also works for gate volunteers. */
@Controller('events/:eventId')
export class EventCompetitionsController {
  constructor(private readonly comps: CompetitionsService) {}

  @RequireAnyEventPermission('EVENT_UPDATE', 'TOKEN_SCAN')
  @Get('competitions')
  list(@Param('eventId') eventId: string) {
    return this.comps.list(eventId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Post('competitions')
  create(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Body() dto: CreateCompetitionDto) {
    return this.comps.create(u, eventId, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Patch('competitions/:id')
  update(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: UpdateCompetitionDto) {
    return this.comps.update(u, eventId, id, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Delete('competitions/:id')
  @HttpCode(204)
  async remove(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string) {
    await this.comps.remove(u, eventId, id);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Get('competitions/:id/entries')
  entries(@Param('eventId') eventId: string, @Param('id') id: string, @Query() q: EntryListQuery) {
    return this.comps.entries(eventId, id, q);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Get('competitions/:id/entries.csv')
  async csv(@Param('eventId') eventId: string, @Param('id') id: string, @Res() res: Response) {
    const { csv, filename } = await this.comps.entriesCsv(eventId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(csv);
  }

  @RequireAnyEventPermission('EVENT_UPDATE', 'TOKEN_SCAN')
  @RequireLiveEvent('run competitions')
  @Post('competitions/:id/check-in')
  checkIn(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: CheckInDto) {
    return this.comps.checkIn(u, eventId, id, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Post('competitions/:id/heats')
  heats(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('id') id: string, @Body() dto: AssignHeatsDto) {
    return this.comps.assignHeats(u, eventId, id, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Patch('competition-entries/:entryId/result')
  result(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('entryId') entryId: string, @Body() dto: ResultDto) {
    return this.comps.setResult(u, eventId, entryId, dto);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Delete('competition-entries/:entryId/result')
  clearResult(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('entryId') entryId: string) {
    return this.comps.clearResult(u, eventId, entryId);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @RequireLiveEvent('run competitions')
  @Post('competition-entries/:entryId/cancel')
  cancel(@CurrentUser() u: RequestUser, @Param('eventId') eventId: string, @Param('entryId') entryId: string, @Body() dto: CancelEntryDto) {
    return this.comps.cancelEntry(u, eventId, entryId, dto);
  }
}

/** Visitors: browse, enter (no account), pay, see the entry / results / certificate with the access key. */
@Public()
@Controller('public')
export class PublicCompetitionsController {
  constructor(private readonly comps: CompetitionsService) {}

  @Get('events/:eventId/competitions')
  forEvent(@Param('eventId') eventId: string) {
    return this.comps.publicForEvent(eventId);
  }

  @Get('competitions/:id')
  one(@Param('id') id: string) {
    return this.comps.publicOne(id);
  }

  @Throttle({ default: { limit: ENTRY_LIMIT, ttl: 60_000 } })
  @Post('competitions/entries')
  enter(@Body() dto: CreateEntryDto) {
    return this.comps.createEntry(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('competitions/entries/:id')
  entry(@Param('id') id: string, @Query() q: EntryKeyQuery) {
    return this.comps.getEntry(id, q.k);
  }

  @Throttle({ default: { limit: ENTRY_LIMIT, ttl: 60_000 } })
  @Post('competitions/entries/:id/demo-pay')
  demoPay(@Param('id') id: string, @Body() dto: DemoPayEntryDto) {
    return this.comps.demoPay(id, dto.k, dto.outcome);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('competitions/entries/:id/certificate')
  certificate(@Param('id') id: string, @Query() q: EntryKeyQuery) {
    return this.comps.certificate(id, q.k);
  }
}
