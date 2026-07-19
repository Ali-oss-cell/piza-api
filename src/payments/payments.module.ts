import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule, CrmModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
