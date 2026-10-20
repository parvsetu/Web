import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformDirectoryController } from './platform-directory.controller';

@Module({ controllers: [PlatformController, PlatformDirectoryController] })
export class PlatformModule {}
