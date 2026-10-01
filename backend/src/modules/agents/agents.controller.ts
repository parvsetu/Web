import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/auth/decorators';
import { RequestUser } from '../../common/auth/request-user';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { PageQuery } from '../../common/http';
import { AgentRegistrationDto } from '../registrations/registrations.dto';
import { RegistrationsService } from '../registrations/registrations.service';
import { meta } from '../registrations/registrations.controller';
import { AgentCtx, AgentRoute, CurrentAgent } from './agent.guard';
import { AgentsService } from './agents.service';
import { AgentListQuery, AgentMandalQuery, AgentPayoutDto, AttributeAgentDto, CreateAgentDto, UpdateAgentDto } from './agents.dto';

@Controller()
export class AgentsController {
  constructor(private readonly agents: AgentsService, private readonly registrations: RegistrationsService) {}

  // ─── Agent portal ──────────────────────────────────────────────────

  @AgentRoute()
  @Get('agent/me')
  overview(@CurrentAgent() a: AgentCtx) {
    return this.agents.overview(a);
  }

  @AgentRoute()
  @Get('agent/mandals')
  mandals(@CurrentAgent() a: AgentCtx, @Query() q: AgentMandalQuery) {
    return this.agents.mandals(a, q);
  }

  @AgentRoute('write')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('agent/mandal-registrations')
  register(@CurrentUser() user: RequestUser, @CurrentAgent() a: AgentCtx, @Body() dto: AgentRegistrationDto, @Req() req: Request) {
    return this.registrations.createByAgent(user, a.id, dto, meta(req));
  }

  @AgentRoute()
  @Get('agent/ledger')
  ledger(@CurrentAgent() a: AgentCtx, @Query() q: PageQuery) {
    return this.agents.ledger(a.id, q);
  }

  @AgentRoute()
  @Get('agent/payouts')
  payouts(@CurrentAgent() a: AgentCtx, @Query() q: PageQuery) {
    return this.agents.payouts(a.id, q);
  }

  // ─── Super admin ───────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get('platform/agents')
  list(@Query() q: AgentListQuery) {
    return this.agents.list(q);
  }

  @SuperAdminOnly()
  @Post('platform/agents')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAgentDto) {
    return this.agents.create(user, dto);
  }

  @SuperAdminOnly()
  @Get('platform/agents/:id')
  detail(@Param('id') id: string) {
    return this.agents.detail(id);
  }

  @SuperAdminOnly()
  @Patch('platform/agents/:id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(user, id, dto);
  }

  @SuperAdminOnly()
  @Get('platform/agents/:id/ledger')
  agentLedger(@Param('id') id: string, @Query() q: PageQuery) {
    return this.agents.ledger(id, q);
  }

  @SuperAdminOnly()
  @Get('platform/agents/:id/payouts')
  agentPayouts(@Param('id') id: string, @Query() q: PageQuery) {
    return this.agents.payouts(id, q);
  }

  @SuperAdminOnly()
  @Post('platform/agents/:id/payouts')
  @HttpCode(200)
  payout(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AgentPayoutDto) {
    return this.agents.payout(user, id, dto);
  }

  @SuperAdminOnly()
  @Post('platform/organizations/:orgId/agent')
  @HttpCode(200)
  attribute(@CurrentUser() user: RequestUser, @Param('orgId') orgId: string, @Body() dto: AttributeAgentDto) {
    return this.agents.attribute(user, orgId, dto);
  }
}
