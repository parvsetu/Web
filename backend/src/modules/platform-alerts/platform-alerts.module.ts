import { Module } from '@nestjs/common';
import { PlatformAlertsController } from './platform-alerts.controller';
import { PlatformAlertsService } from './platform-alerts.service';

/** Emails / pushes super admins when something new is waiting for review; pending counts for the console. */
@Module({ controllers: [PlatformAlertsController], providers: [PlatformAlertsService], exports: [PlatformAlertsService] })
export class PlatformAlertsModule {}
