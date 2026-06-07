import { Module } from '@nestjs/common';
import { CustomizationsModule } from '../customizations/customizations.module';
import { MenuController } from './menu.controller';
import { MenuService } from './menu.service';

@Module({
  imports: [CustomizationsModule],
  controllers: [MenuController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
