import { Global, Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/** Web push notifications (pass reminders, organiser / blogger / vendor alerts). Global: any module can notify. */
@Global()
@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
