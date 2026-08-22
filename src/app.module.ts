import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { BrandsModule } from './brands/brands.module';
import { DatabaseBootstrapService } from './bootstrap/database-bootstrap.service';
import { CrmModule } from './crm/crm.module';
import { HealthController } from './health/health.controller';
import { DealsModule } from './deals/deals.module';
import { CustomizationsModule } from './customizations/customizations.module';
import { HqModule } from './hq/hq.module';
import { InventoryModule } from './inventory/inventory.module';
import { LocationsAdminModule } from './locations-admin/locations-admin.module';
import { MailModule } from './mail/mail.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PaymentSettingsModule } from './payment-settings/payment-settings.module';
import { PosModule } from './pos/pos.module';
import { PricingModule } from './pricing/pricing.module';
import { PrismaModule } from './prisma/prisma.module';
import { SeoModule } from './seo/seo.module';
import { SettingsModule } from './settings/settings.module';
import { TeamModule } from './team/team.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    SentryModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailModule,
    AuditModule,
    BrandsModule,
    UsersModule,
    AuthModule,
    MenuModule,
    CustomizationsModule,
    DealsModule,
    OrdersModule,
    SettingsModule,
    PricingModule,
    PaymentsModule,
    PaymentSettingsModule,
    PosModule,
    UploadsModule,
    WebhooksModule,
    HqModule,
    CrmModule,
    TeamModule,
    LocationsAdminModule,
    InventoryModule,
    SeoModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    DatabaseBootstrapService,
  ],
})
export class AppModule {}
