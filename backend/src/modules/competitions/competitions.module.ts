import { Module } from '@nestjs/common';
import { PASS_GATEWAYS, buildPassGateways } from '../passes/pass-gateways';
import { EventCompetitionsController, PublicCompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';

/** Festival competitions with online entry fees. Payments use the same gateways as online passes. */
@Module({
  controllers: [EventCompetitionsController, PublicCompetitionsController],
  providers: [CompetitionsService, { provide: PASS_GATEWAYS, useFactory: buildPassGateways }],
})
export class CompetitionsModule {}
