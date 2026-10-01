import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { SearchPageQuery } from '../../common/http';
import { Access, CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { AccessContext } from '../../common/access/access.service';
import { RequireEventPermission, RequireOrgPermission } from '../../common/access/permission.guard';
import { EventsService } from './events.service';
import { PriceRulesService } from './price-rules.service';
import { CreatePriceRuleDto, UpdatePriceRuleDto } from './price-rules.dto';
import {
  CreateAssignmentDto, CreateEventDto, CreateTimeSlotDto, UpdateAssignmentDto, UpdateEventDto, UpdateTimeSlotDto,
} from './events.dto';

@Controller()
export class EventsController {
  constructor(private readonly events: EventsService, private readonly priceRules: PriceRulesService) {}

  @Get('events')
  mine(@CurrentUser() user: RequestUser) {
    return this.events.listMine(user);
  }

  @RequireOrgPermission('EVENT_VIEW')
  @Get('organizations/:orgId/events')
  listForOrg(@Param('orgId') orgId: string, @Query() q: SearchPageQuery) {
    return this.events.listForOrg(orgId, q);
  }

  @RequireOrgPermission('EVENT_CREATE')
  @Post('organizations/:orgId/events')
  create(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: CreateEventDto) {
    return this.events.create(user, orgId, dto);
  }

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId')
  get(@Param('eventId') eventId: string, @Access() access: AccessContext) {
    return this.events.get(eventId, access.perms);
  }

  @RequireEventPermission('EVENT_UPDATE')
  @Patch('events/:eventId')
  update(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string, @Body() dto: UpdateEventDto) {
    return this.events.update(user, eventId, dto);
  }

  @RequireEventPermission('EVENT_DELETE')
  @Delete('events/:eventId')
  @HttpCode(204)
  async remove(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string) {
    await this.events.remove(user, eventId);
  }

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/time-slots')
  slots(@Param('eventId') eventId: string) {
    return this.events.slots(eventId);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Post('events/:eventId/time-slots')
  createSlot(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Body() dto: CreateTimeSlotDto) {
    return this.events.createSlot(user, a.organizationId, eventId, dto);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Patch('events/:eventId/time-slots/:slotId')
  updateSlot(
    @CurrentUser() user: RequestUser, @Access() a: AccessContext,
    @Param('eventId') eventId: string, @Param('slotId') slotId: string, @Body() dto: UpdateTimeSlotDto,
  ) {
    return this.events.updateSlot(user, a.organizationId, eventId, slotId, dto);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Delete('events/:eventId/time-slots/:slotId')
  removeSlot(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('slotId') slotId: string) {
    return this.events.removeSlot(user, a.organizationId, eventId, slotId);
  }

  // ─── Peak-day pricing ──────────────────────────────────────────────

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/price-rules')
  priceRuleList(@Param('eventId') eventId: string) {
    return this.priceRules.list(eventId);
  }

  @RequireEventPermission('EVENT_VIEW')
  @Get('events/:eventId/price-rules/preview')
  priceRulePreview(@Param('eventId') eventId: string) {
    return this.priceRules.preview(eventId);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Post('events/:eventId/price-rules')
  createPriceRule(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Body() dto: CreatePriceRuleDto) {
    return this.priceRules.create(user, a.organizationId, eventId, dto);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Patch('events/:eventId/price-rules/:ruleId')
  updatePriceRule(
    @CurrentUser() user: RequestUser, @Access() a: AccessContext,
    @Param('eventId') eventId: string, @Param('ruleId') ruleId: string, @Body() dto: UpdatePriceRuleDto,
  ) {
    return this.priceRules.update(user, a.organizationId, eventId, ruleId, dto);
  }

  @RequireEventPermission('SETTINGS_UPDATE')
  @Delete('events/:eventId/price-rules/:ruleId')
  @HttpCode(204)
  async removePriceRule(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('ruleId') ruleId: string) {
    await this.priceRules.remove(user, a.organizationId, eventId, ruleId);
  }

  @RequireEventPermission('VOLUNTEER_VIEW')
  @Get('events/:eventId/assignments')
  assignments(@Param('eventId') eventId: string, @Query() q: SearchPageQuery) {
    return this.events.assignments(eventId, q);
  }

  @RequireEventPermission('VOLUNTEER_ASSIGN')
  @Post('events/:eventId/assignments')
  assign(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Body() dto: CreateAssignmentDto) {
    return this.events.assign(user, a.perms, a.organizationId, eventId, dto);
  }

  @RequireEventPermission('VOLUNTEER_ASSIGN')
  @Patch('events/:eventId/assignments/:assignmentId')
  updateAssignment(
    @CurrentUser() user: RequestUser, @Access() a: AccessContext,
    @Param('eventId') eventId: string, @Param('assignmentId') assignmentId: string, @Body() dto: UpdateAssignmentDto,
  ) {
    return this.events.updateAssignment(user, a.perms, a.organizationId, eventId, assignmentId, dto);
  }

  @RequireEventPermission('VOLUNTEER_DELETE')
  @Delete('events/:eventId/assignments/:assignmentId')
  @HttpCode(204)
  async removeAssignment(@CurrentUser() user: RequestUser, @Access() a: AccessContext, @Param('eventId') eventId: string, @Param('assignmentId') assignmentId: string) {
    await this.events.removeAssignment(user, a.perms, a.organizationId, eventId, assignmentId);
  }
}
