import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailService } from './mail.service';
import { OrderReceiptMailService } from './order-receipt-mail.service';

@Module({
  imports: [PrismaModule],
  providers: [MailService, OrderReceiptMailService],
  exports: [MailService, OrderReceiptMailService],
})
export class MailModule {}
