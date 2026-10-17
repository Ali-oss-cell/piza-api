import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { decryptLinklySecret } from '../payments/linkly-crypto';
import { PrismaService } from '../prisma/prisma.service';

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
  replyTo?: string;
  attachments?: MailAttachment[];
};

/** Resolved SMTP config for one store (password already decrypted). */
export type StoreSmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** True when server-level env email (Resend or SMTP) is configured. */
  isConfigured(): boolean {
    return Boolean(this.resendApiKey() || this.smtpHost());
  }

  /** True when the store has its own enabled SMTP, or env email is available. */
  async isConfiguredFor(brandId?: string | null): Promise<boolean> {
    if (brandId && (await this.loadStoreConfig(brandId))) {
      return true;
    }
    return this.isConfigured();
  }

  /**
   * Send mail. If `brandId` is given and the store has enabled SMTP settings,
   * those are used; otherwise falls back to server env (Resend / SMTP).
   */
  async send(options: SendMailOptions, brandId?: string | null): Promise<void> {
    if (brandId) {
      const storeConfig = await this.loadStoreConfig(brandId);
      if (storeConfig) {
        await this.sendViaStoreSmtp(storeConfig, options);
        return;
      }
    }

    const from = this.fromAddress();
    if (!from) {
      throw new ServiceUnavailableException(
        'Email is not configured. Add SMTP settings for this store in Infrastructure → Email, or set MAIL_FROM plus RESEND_API_KEY / SMTP_HOST on the server.',
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
      'Email is not configured. Add SMTP settings for this store in Infrastructure → Email.',
    );
  }

  /** Verify credentials and send a test message using the supplied config. */
  async sendTest(config: StoreSmtpConfig, to: string): Promise<void> {
    const transporter = this.createTransport(config);
    try {
      await transporter.verify();
      await transporter.sendMail({
        from: this.formatFrom(config),
        to,
        replyTo: config.replyTo || undefined,
        subject: 'Test email from your store dashboard',
        text: 'Your SMTP settings work. This is a test message sent from the dashboard.',
        html: '<p>Your SMTP settings work.</p><p>This is a test message sent from the dashboard.</p>',
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }

  async loadStoreConfig(brandId: string): Promise<StoreSmtpConfig | null> {
    const row = await this.prisma.storeEmailSettings.findUnique({
      where: { storeId: brandId },
    });
    if (!row || !row.enabled || !row.host?.trim()) {
      return null;
    }

    let password: string | undefined;
    if (row.passwordEnc) {
      try {
        password = decryptLinklySecret(this.config, row.passwordEnc);
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt SMTP password for store ${brandId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return null;
      }
    }

    const fromEmail =
      row.fromEmail?.trim() ||
      (row.username && row.username.includes('@') ? row.username : undefined);
    if (!fromEmail) {
      return null;
    }

    return {
      host: row.host.trim(),
      port: row.port,
      secure: row.secure || row.port === 465,
      username: row.username?.trim() || undefined,
      password,
      fromName: row.fromName?.trim() || undefined,
      fromEmail,
      replyTo: row.replyTo?.trim() || undefined,
    };
  }

  private formatFrom(config: StoreSmtpConfig): string {
    const email = config.fromEmail ?? config.username ?? '';
    return config.fromName
      ? `"${config.fromName.replace(/"/g, '')}" <${email}>`
      : email;
  }

  private createTransport(config: StoreSmtpConfig) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.username && config.password
          ? { user: config.username, pass: config.password }
          : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 30000,
    });
  }

  private async sendViaStoreSmtp(
    config: StoreSmtpConfig,
    options: SendMailOptions,
  ): Promise<void> {
    const transporter = this.createTransport(config);
    try {
      await transporter.sendMail({
        from: this.formatFrom(config),
        to: options.to,
        replyTo: options.replyTo ?? config.replyTo,
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
        `Store SMTP send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ServiceUnavailableException(
        'Failed to send email via this store\'s SMTP. Check Infrastructure → Email settings.',
      );
    }
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
    if (options.replyTo) {
      payload.reply_to = options.replyTo;
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
        replyTo: options.replyTo,
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
