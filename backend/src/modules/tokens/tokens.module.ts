import { Module } from '@nestjs/common';
import { TokensController } from './tokens.controller';
import { TokensService } from './tokens.service';
import { ScanService } from './scan.service';

@Module({
  controllers: [TokensController],
  providers: [TokensService, ScanService],
  exports: [ScanService],
})
export class TokensModule {}
