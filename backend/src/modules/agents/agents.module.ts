import { Module } from '@nestjs/common';
import { RegistrationsModule } from '../registrations/registrations.module';
import { AgentGuard } from './agent.guard';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

/** Field agents: portal (/agent/*) and super-admin management (/platform/agents). */
@Module({
  imports: [RegistrationsModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentGuard],
})
export class AgentsModule {}
