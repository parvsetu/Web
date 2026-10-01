import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AccessModule } from './common/access/access.module';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { PermissionGuard } from './common/access/permission.guard';
import { UserThrottlerGuard } from './common/throttle.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { EventsModule } from './modules/events/events.module';
import { VolunteersModule } from './modules/volunteers/volunteers.module';
import { TokensModule } from './modules/tokens/tokens.module';
import { DonationsModule } from './modules/donations/donations.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PublicModule } from './modules/public/public.module';
import { PassesModule } from './modules/passes/passes.module';
import { SponsorsModule } from './modules/sponsors/sponsors.module';
import { BillingModule } from './modules/billing/billing.module';
import { PayoutsModule } from './modules/payouts/payouts.module';
import { MailModule } from './common/mail/mail.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 600) }]),
    PrismaModule,
    MailModule,
    AccessModule,
    AuthModule,
    OrganizationsModule,
    EventsModule,
    VolunteersModule,
    TokensModule,
    DonationsModule,
    ExpensesModule,
    ReportsModule,
    PlatformModule,
    PublicModule,
    PassesModule,
    SponsorsModule,
    BillingModule,
    PayoutsModule,
  ],
  providers: [
    // Order matters: authenticate → rate-limit (per user) → authorize.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
