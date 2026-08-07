import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendMailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.resendApiKey() || this.smtpHost());
  }

  async send(options: SendMailOptions): Promise<void> {
    const from = this.fromAddress();
    if (!from) {
      throw new ServiceUnavailableException(
        'Email is not configured (set MAIL_FROM plus RESEND_API_KEY or SMTP_HOST).',
      );
    }

    if (this.resendApiKey()) {
      await this.sendViaResend(from, options);
      return;
    }

    if (this.smtpHost()) {
      await this.sendViaSmtp(from, options);
      return;
    }

    throw new ServiceUnavailableException(
      'Email is not configured (set RESEND_API_KEY or SMTP_HOST).',
    );
  }

  private resendApiKey(): string | undefined {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    return key || undefined;
  }

  private smtpHost(): string | undefined {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    return host || undefined;
  }

  private fromAddress(): string | undefined {
    const from = this.config.get<string>('MAIL_FROM')?.trim();
    return from || undefined;
  }

  private async sendViaResend(
    from: string,
    options: SendMailOptions,
  ): Promise<void> {
    const apiKey = this.resendApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('RESEND_API_KEY is missing.');
    }

    const payload: Record<string, unknown> = {
      from,
      to: [options.to],
      subject: options.subject,
      text: options.text,
    };
    if (options.html) {
      payload.html = options.html;
    }
    if (options.attachments?.length) {
      payload.attachments = options.attachments.map((file) => ({
        filename: file.filename,
        content: file.content.toString('base64'),
        content_type: file.contentType ?? 'application/octet-stream',
      }));
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Resend failed (${response.status}): ${body}`);
      throw new ServiceUnavailableException(
        'Failed to send email via Resend. Check RESEND_API_KEY and MAIL_FROM.',
      );
    }
  }

  private async sendViaSmtp(
    from: string,
    options: SendMailOptions,
  ): Promise<void> {
    const host = this.smtpHost();
    if (!host) {
      throw new ServiceUnavailableException('SMTP_HOST is missing.');
    }

    const port = Number(this.config.get<string>('SMTP_PORT') ?? '587');
    const user = this.config.get<string>('SMTP_USER')?.trim() || undefined;
    const pass = this.config.get<string>('SMTP_PASS')?.trim() || undefined;
    const secure =
      this.config.get<string>('SMTP_SECURE')?.trim() === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    try {
      await transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map((file) => ({
          filename: file.filename,
          content: file.content,
          contentType: file.contentType,
        })),
      });
    } catch (error) {
      this.logger.error(
        `SMTP send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Failed to send email via SMTP. Check SMTP_* settings.',
      );
    }
  }
}
