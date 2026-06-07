import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { DatabaseBootstrapService } from './bootstrap/database-bootstrap.service';
import { HealthController } from './health/health.controller';
import { DealsModule } from './deals/deals.module';
import { CustomizationsModule } from './customizations/customizations.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MenuModule,
    CustomizationsModule,
    DealsModule,
    OrdersModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [DatabaseBootstrapService],
})
export class AppModule {}
