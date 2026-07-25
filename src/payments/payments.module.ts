import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LinklyService } from './linkly.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule, CrmModule],
  providers: [StripeService, LinklyService],
  exports: [StripeService, LinklyService],
})
export class PaymentsModule {}
