import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StripeService } from './stripe.service';

@Module({
  imports: [PrismaModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
