import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BrandsService } from '../brands/brands.service';
import { MailService, type StoreSmtpConfig } from '../mail/mail.service';
import {
  decryptLinklySecret,
  encryptLinklySecret,
} from '../payments/linkly-crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmailSettingsDto } from './dto/update-email-settings.dto';

export type EmailSettingsResponse = {
  storeId: string;
  storeSlug: string;
  enabled: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  /** True when no store SMTP is active and the server env mail will be used. */
  usingEnvFallback: boolean;
  envFallbackAvailable: boolean;
};

@Injectable()
export class EmailSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async getForStore(brandSlug?: string): Promise<EmailSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const row = await this.ensure(brand.id);
    return this.toResponse(brand.slug, row);
  }

  async updateForStore(
    dto: UpdateEmailSettingsDto,
    brandSlug?: string,
  ): Promise<EmailSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const existing = await this.ensure(brand.id);

    let passwordEnc: string | null | undefined;
    if (dto.clearPassword) {
      passwordEnc = null;
    } else if (dto.password && dto.password.length > 0) {
      passwordEnc = encryptLinklySecret(this.config, dto.password);
    }

    const nextHost =
      dto.host !== undefined ? dto.host?.trim() || null : existing.host;
    const nextEnabled = dto.enabled ?? existing.enabled;
    if (nextEnabled && !nextHost) {
      throw new BadRequestException('SMTP host is required to enable email.');
    }
    const nextFrom =
      dto.fromEmail !== undefined
        ? dto.fromEmail?.trim() || null
        : existing.fromEmail;
    const nextUser =
      dto.username !== undefined
        ? dto.username?.trim() || null
        : existing.username;
    if (nextEnabled && !nextFrom && !(nextUser && nextUser.includes('@'))) {
      throw new BadRequestException(
        'A From email address is required to enable email.',
      );
    }

    const updated = await this.prisma.storeEmailSettings.update({
      where: { storeId: brand.id },
      data: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.host !== undefined ? { host: nextHost } : {}),
        ...(dto.port !== undefined ? { port: dto.port } : {}),
        ...(dto.secure !== undefined ? { secure: dto.secure } : {}),
        ...(dto.username !== undefined ? { username: nextUser } : {}),
        ...(passwordEnc !== undefined ? { passwordEnc } : {}),
        ...(dto.fromName !== undefined
          ? { fromName: dto.fromName?.trim() || null }
          : {}),
        ...(dto.fromEmail !== undefined ? { fromEmail: nextFrom } : {}),
        ...(dto.replyTo !== undefined
          ? { replyTo: dto.replyTo?.trim() || null }
          : {}),
      },
    });

    await this.audit.log(
      null,
      brand.id,
      AuditAction.EMAIL_SETTINGS_UPDATED,
      `Updated email (SMTP) settings for ${brand.slug}`,
      {
        enabled: updated.enabled,
        host: updated.host,
        port: updated.port,
        passwordChanged: passwordEnc !== undefined,
      },
    );

    return this.toResponse(brand.slug, updated);
  }

  async sendTest(
    to: string,
    brandSlug?: string,
  ): Promise<EmailSettingsResponse & { sentTo: string }> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const row = await this.ensure(brand.id);

    if (!row.host?.trim()) {
      throw new BadRequestException('Save an SMTP host first.');
    }

    let password: string | undefined;
    if (row.passwordEnc) {
      password = decryptLinklySecret(this.config, row.passwordEnc);
    }
    const fromEmail =
      row.fromEmail?.trim() ||
      (row.username && row.username.includes('@') ? row.username : undefined);
    if (!fromEmail) {
      throw new BadRequestException('Save a From email address first.');
    }

    const smtp: StoreSmtpConfig = {
      host: row.host.trim(),
      port: row.port,
      secure: row.secure || row.port === 465,
      username: row.username?.trim() || undefined,
      password,
      fromName: row.fromName?.trim() || undefined,
      fromEmail,
      replyTo: row.replyTo?.trim() || undefined,
    };

    let ok = true;
    let errorMessage: string | null = null;
    try {
      await this.mail.sendTest(smtp, to.trim());
    } catch (error) {
      ok = false;
      errorMessage = (error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      );
    }

    const updated = await this.prisma.storeEmailSettings.update({
      where: { storeId: brand.id },
      data: {
        lastTestAt: new Date(),
        lastTestOk: ok,
        lastTestError: errorMessage,
      },
    });

    if (!ok) {
      throw new BadRequestException(
        `Test email failed: ${errorMessage ?? 'unknown error'}`,
      );
    }

    return { ...this.toResponse(brand.slug, updated), sentTo: to.trim() };
  }

  private async ensure(storeId: string) {
    const existing = await this.prisma.storeEmailSettings.findUnique({
      where: { storeId },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.storeEmailSettings.create({ data: { storeId } });
  }

  private toResponse(
    storeSlug: string,
    row: {
      storeId: string;
      enabled: boolean;
      host: string | null;
      port: number;
      secure: boolean;
      username: string | null;
      passwordEnc: string | null;
      fromName: string | null;
      fromEmail: string | null;
      replyTo: string | null;
      lastTestAt: Date | null;
      lastTestOk: boolean | null;
      lastTestError: string | null;
    },
  ): EmailSettingsResponse {
    const storeActive = Boolean(row.enabled && row.host?.trim());
    return {
      storeId: row.storeId,
      storeSlug,
      enabled: row.enabled,
      host: row.host,
      port: row.port,
      secure: row.secure,
      username: row.username,
      hasPassword: Boolean(row.passwordEnc),
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      replyTo: row.replyTo,
      lastTestAt: row.lastTestAt,
      lastTestOk: row.lastTestOk,
      lastTestError: row.lastTestError,
      usingEnvFallback: !storeActive,
      envFallbackAvailable: this.mail.isConfigured(),
    };
  }
}
