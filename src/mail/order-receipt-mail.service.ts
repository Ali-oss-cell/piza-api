import { Injectable, Logger } from '@nestjs/common';
import { FulfillmentType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { MailService } from './mail.service';
import { PrismaService } from '../prisma/prisma.service';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: { toString(): string } | number | string): string {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : String(value);
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD_ONLINE: 'Card',
  CARD_TERMINAL: 'Card',
  EXTERNAL: 'External',
};

@Injectable()
export class OrderReceiptMailService {
  private readonly logger = new Logger(OrderReceiptMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Email the customer a paid-order receipt. No-op when there is no email
   * or mail is not configured. Never throws — payment must not fail on mail.
   */
  async sendPaidReceipt(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          user: { select: { email: true, firstName: true, lastName: true } },
          storeCustomer: { select: { email: true, name: true } },
          location: {
            select: {
              name: true,
              phone: true,
              email: true,
              address: true,
              suburb: true,
              brandId: true,
              brand: { select: { name: true } },
            },
          },
        },
      });

      if (!order || order.isTraining) {
        return;
      }

      const to =
        order.guestEmail?.trim() ||
        order.user?.email?.trim() ||
        order.storeCustomer?.email?.trim() ||
        null;
      if (!to) {
        return;
      }

      const brandId = order.location.brandId;
      if (!(await this.mail.isConfiguredFor(brandId))) {
        this.logger.warn(
          `Paid receipt skipped for order ${orderId}: email not configured`,
        );
        return;
      }

      const brandName = order.location.brand.name;
      const customerName =
        order.guestName?.trim() ||
        order.storeCustomer?.name?.trim() ||
        (order.user
          ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim()
          : '') ||
        null;

      const ticket =
        order.ticketNumber != null ? String(order.ticketNumber) : null;
      const fulfillment =
        order.fulfillmentType === FulfillmentType.DELIVERY
          ? 'Delivery'
          : order.fulfillmentType === FulfillmentType.DINE_IN
            ? 'Dine-in'
            : order.fulfillmentType === FulfillmentType.COUNTER
              ? 'Counter'
              : 'Pickup';

      const payment =
        order.paymentMethod != null
          ? PAYMENT_LABEL[order.paymentMethod] ?? 'Paid'
          : 'Paid';

      const addressParts = [
        order.deliveryAddressLine1,
        order.deliveryAddressLine2,
        [order.deliverySuburb, order.deliveryState, order.deliveryPostcode]
          .filter(Boolean)
          .join(' '),
      ].filter((p) => p && String(p).trim());

      const lineText = order.items
        .map((item) => {
          const extras: string[] = [];
          if (item.size) extras.push(item.size);
          if (item.crust) extras.push(item.crust);
          const suffix = extras.length ? ` (${extras.join(', ')})` : '';
          return `• ${item.quantity}× ${item.name}${suffix} — ${money(item.price)}`;
        })
        .join('\n');

      const subject = ticket
        ? `${brandName} — Order #${ticket} confirmed`
        : `${brandName} — Payment received`;

      const hello = customerName ? `Hi ${customerName},` : 'Hi,';
      const text = [
        hello,
        '',
        `Thanks — we've received your payment.`,
        ticket ? `Order number: #${ticket}` : null,
        `Type: ${fulfillment}`,
        `Paid: ${money(order.total)} (${payment})`,
        addressParts.length
          ? `Delivery address:\n${addressParts.join('\n')}`
          : null,
        order.notes ? `Notes: ${order.notes}` : null,
        '',
        'YOUR ORDER',
        lineText,
        '',
        order.discountAmount && Number(order.discountAmount) > 0
          ? `Discount: -${money(order.discountAmount)}`
          : null,
        Number(order.deliveryFee) > 0
          ? `Delivery fee: ${money(order.deliveryFee)}`
          : null,
        `Total: ${money(order.total)}`,
        '',
        `— ${brandName}`,
        order.location.phone ? `Phone: ${order.location.phone}` : null,
        order.location.address || order.location.suburb
          ? [order.location.address, order.location.suburb]
              .filter(Boolean)
              .join(', ')
          : null,
      ]
        .filter((l) => l !== null)
        .join('\n');

      const rows = order.items
        .map((item) => {
          const extras: string[] = [];
          if (item.size) extras.push(item.size);
          if (item.crust) extras.push(item.crust);
          const detail = extras.length
            ? `<div style="color:#666;font-size:12px">${esc(extras.join(' · '))}</div>`
            : '';
          return `<tr>
            <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee;vertical-align:top">${item.quantity}× ${esc(item.name)}${detail}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${esc(money(item.price))}</td>
          </tr>`;
        })
        .join('');

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18181b;line-height:1.45;max-width:560px">
        <p>${esc(hello)}</p>
        <p>Thanks — we've received your payment.</p>
        <table style="border-collapse:collapse;margin:12px 0 16px;font-size:14px">
          ${
            ticket
              ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Order number</td><td style="padding:4px 0"><strong style="color:#d81b60">#${esc(ticket)}</strong></td></tr>`
              : ''
          }
          <tr><td style="padding:4px 16px 4px 0;color:#666">Type</td><td style="padding:4px 0">${esc(fulfillment)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#666">Paid</td><td style="padding:4px 0"><strong>${esc(money(order.total))}</strong> <span style="color:#666">(${esc(payment)})</span></td></tr>
          ${
            addressParts.length
              ? `<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top">Delivery</td><td style="padding:4px 0">${addressParts.map((p) => esc(String(p))).join('<br>')}</td></tr>`
              : ''
          }
        </table>
        ${order.notes ? `<p><strong>Notes:</strong> ${esc(order.notes)}</p>` : ''}
        <table style="border-collapse:collapse;width:100%;font-size:14px;margin-top:8px">
          <thead><tr style="background:#f4f4f5">
            <th align="left" style="padding:8px 12px 8px 0">Item</th>
            <th align="right" style="padding:8px 0">Price</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <table style="border-collapse:collapse;margin-top:12px;font-size:14px;width:100%">
          ${
            order.discountAmount && Number(order.discountAmount) > 0
              ? `<tr><td style="padding:2px 0;color:#666">Discount</td><td style="padding:2px 0;text-align:right">-${esc(money(order.discountAmount))}</td></tr>`
              : ''
          }
          ${
            Number(order.deliveryFee) > 0
              ? `<tr><td style="padding:2px 0;color:#666">Delivery fee</td><td style="padding:2px 0;text-align:right">${esc(money(order.deliveryFee))}</td></tr>`
              : ''
          }
          <tr><td style="padding:8px 0 0;font-weight:700">Total</td><td style="padding:8px 0 0;text-align:right;font-weight:700">${esc(money(order.total))}</td></tr>
        </table>
        <p style="margin-top:20px">— <strong>${esc(brandName)}</strong>${
          order.location.phone
            ? `<br><span style="color:#666">${esc(order.location.phone)}</span>`
            : ''
        }</p>
      </div>`;

      const replyTo = order.location.email?.trim() || undefined;

      await this.mail.send(
        {
          to,
          subject,
          text,
          html,
          replyTo,
        },
        brandId,
      );
      this.logger.log(`Paid receipt sent for order ${orderId} → ${to}`);
    } catch (error) {
      this.logger.error(
        `Paid receipt failed for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Apology when the store cannot fulfil a paid online order.
   * Never names staff. Never throws.
   */
  async sendRefusalApology(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          storeCustomer: { select: { email: true, name: true } },
          location: {
            select: {
              name: true,
              phone: true,
              email: true,
              brandId: true,
              brand: { select: { name: true } },
            },
          },
        },
      });

      if (!order || order.isTraining) {
        return;
      }

      const to =
        order.guestEmail?.trim() ||
        order.user?.email?.trim() ||
        order.storeCustomer?.email?.trim() ||
        null;
      if (!to) {
        return;
      }

      const brandId = order.location.brandId;
      if (!(await this.mail.isConfiguredFor(brandId))) {
        this.logger.warn(
          `Refusal apology skipped for order ${orderId}: email not configured`,
        );
        return;
      }

      const brandName = order.location.brand.name;
      const customerName =
        order.guestName?.trim() ||
        order.storeCustomer?.name?.trim() ||
        (order.user
          ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`.trim()
          : '') ||
        null;
      const ticket =
        order.ticketNumber != null ? String(order.ticketNumber) : null;
      const hello = customerName ? `Hi ${customerName},` : 'Hi,';
      const refundNote =
        order.paymentStatus === PaymentStatus.REFUNDED ||
        order.paymentStatus === PaymentStatus.PAID
          ? 'If you paid online, a full refund is being processed and should appear on your statement shortly.'
          : 'No payment was taken for this order.';

      const subject = ticket
        ? `${brandName} — We're sorry about order #${ticket}`
        : `${brandName} — We're sorry we couldn't complete your order`;

      const text = [
        hello,
        '',
        `We're really sorry — we weren't able to fulfil your order${
          ticket ? ` #${ticket}` : ''
        } today.`,
        '',
        refundNote,
        '',
        'We know this is disappointing. If you still need pizza, please call us or place a new order when you can.',
        order.location.phone ? `Phone: ${order.location.phone}` : null,
        '',
        `— ${brandName}`,
      ]
        .filter((l) => l !== null)
        .join('\n');

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#18181b;line-height:1.45;max-width:560px">
        <p>${esc(hello)}</p>
        <p>We're really sorry — we weren't able to fulfil your order${
          ticket ? ` <strong>#${esc(ticket)}</strong>` : ''
        } today.</p>
        <p>${esc(refundNote)}</p>
        <p>We know this is disappointing. If you still need pizza, please call us or place a new order when you can.</p>
        <p style="margin-top:20px">— <strong>${esc(brandName)}</strong>${
          order.location.phone
            ? `<br><span style="color:#666">${esc(order.location.phone)}</span>`
            : ''
        }</p>
      </div>`;

      await this.mail.send(
        {
          to,
          subject,
          text,
          html,
          replyTo: order.location.email?.trim() || undefined,
        },
        brandId,
      );
      this.logger.log(`Refusal apology sent for order ${orderId} → ${to}`);
    } catch (error) {
      this.logger.error(
        `Refusal apology failed for order ${orderId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
