import { Module } from '@nestjs/common';
import { PassesModule } from '../passes/passes.module';
import { ProgrammeController } from './programme.controller';
import { ProgrammeService } from './programme.service';

@Module({ imports: [PassesModule], controllers: [ProgrammeController], providers: [ProgrammeService], exports: [ProgrammeService] })
export class ProgrammeModule {}
