import { Body, Controller, Get, Put } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { SuperAdminOnly } from '../../common/access/permission.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAlertsService } from './platform-alerts.service';

class AlertSettingsDto {
  /** Comma-separated extra addresses (e.g. a team inbox); empty clears. */
  @IsOptional() @IsString() @MaxLength(1000) alertEmails?: string;
}

@SuperAdminOnly()
@Controller('platform')
export class PlatformAlertsController {
  constructor(private readonly alerts: PlatformAlertsService, private readonly prisma: PrismaService) {}

  /** Open items per Platform tab — badges and the "Waiting for you" strip. */
  @Get('pending')
  pending() {
    return this.alerts.pendingCounts();
  }

  /** Counts plus the waiting items themselves (newest first) — the notification bell. */
  @Get('pending/items')
  async items() {
    const [counts, items] = await Promise.all([this.alerts.pendingCounts(), this.alerts.waiting()]);
    return { counts, items };
  }

  @Get('alert-settings')
  async settings() {
    const s = await this.prisma.platformSettings.findUnique({ where: { id: 'default' }, select: { alertEmails: true } });
    return { alertEmails: s?.alertEmails ?? '' };
  }

  @Put('alert-settings')
  async update(@Body() dto: AlertSettingsDto) {
    const alertEmails = (dto.alertEmails ?? '').split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean).join(', ');
    await this.prisma.platformSettings.upsert({ where: { id: 'default' }, create: { id: 'default', alertEmails: alertEmails || null }, update: { alertEmails: alertEmails || null } });
    return { alertEmails };
  }
}
