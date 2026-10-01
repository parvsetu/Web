import { applyDecorators, CanActivate, createParamDecorator, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UseGuards } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/auth/request-user';

const AGENT_MODE = 'agentMode';

export interface AgentCtx {
  id: string;
  name: string;
  code: string;
  status: AgentStatus;
}

/**
 * /agent/* routes: the caller must be a field-agent account (User.agentId).
 *   read  — any agent (a SUSPENDED agent keeps read-only access to its history and earnings)
 *   write — ACTIVE only (registering a mandal)
 * Mandal / partner users get 403 here; agents get 404 on every org/event route
 * because they have no memberships (AccessService), and 403 on /platform.
 */
export const AgentRoute = (mode: 'read' | 'write' = 'read') => applyDecorators(SetMetadata(AGENT_MODE, mode), UseGuards(AgentGuard));

export const CurrentAgent = createParamDecorator((_d: unknown, ctx: ExecutionContext): AgentCtx => ctx.switchToHttp().getRequest().agent);

@Injectable()
export class AgentGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const mode = this.reflector.getAllAndOverride<'read' | 'write'>(AGENT_MODE, [context.getHandler(), context.getClass()]) ?? 'read';
    const user: RequestUser | undefined = req.user;
    const agent = user?.agentId ? await this.prisma.agent.findUnique({ where: { id: user.agentId }, select: { id: true, name: true, code: true, status: true } }) : null;
    if (!agent) throw new ForbiddenException({ statusCode: 403, message: 'This area is for Parvsetu field agents.', code: 'NOT_AN_AGENT' });
    if (mode === 'write' && agent.status !== 'ACTIVE') {
      throw new ForbiddenException({ statusCode: 403, code: 'AGENT_SUSPENDED', message: 'Your agent account is suspended. Contact the Parvsetu team.' });
    }
    req.agent = agent;
    return true;
  }
}
