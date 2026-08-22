import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PlatformSecretsService } from '../platform-secrets/platform-secrets.service';

export type LinklyPurchaseResult = {
  approved: boolean;
  responseCode: string;
  responseText: string;
  sessionId: string;
  txnRef: string;
  rfn?: string;
  hostRef?: string;
  raw?: unknown;
};

@Injectable()
export class LinklyService {
  private readonly logger = new Logger(LinklyService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly platformSecrets: PlatformSecretsService,
  ) {}

  private resolveLinklyEnv(): string {
    return (
      this.platformSecrets.getPlain('LINKLY_ENV') ??
      this.config.get<string>('LINKLY_ENV') ??
      'sandbox'
    )
      .trim()
      .toLowerCase();
  }

  getAuthBase(): string {
    const override = this.config.get<string>('LINKLY_AUTH_BASE')?.trim();
    if (override) {
      return override.replace(/\/$/, '');
    }

    const env = this.resolveLinklyEnv();
    return env === 'production'
      ? 'https://auth.cloud.pceftpos.com'
      : 'https://auth.sandbox.cloud.pceftpos.com';
  }

  getRestBase(): string {
    const override = this.config.get<string>('LINKLY_REST_BASE')?.trim();
    if (override) {
      return override.replace(/\/$/, '');
    }

    const env = this.resolveLinklyEnv();
    return env === 'production'
      ? 'https://rest.pos.cloud.pceftpos.com/v1'
      : 'https://rest.pos.sandbox.cloud.pceftpos.com/v1';
  }

  getPosVendorId(): string {
    return (
      this.config.get<string>('LINKLY_POS_VENDOR_ID')?.trim() ||
      'a256b7ec-709d-4c7d-8ffe-57cc7ca1fd22'
    );
  }

  async pair(params: {
    username: string;
    password: string;
    pairCode: string;
  }): Promise<string> {
    const url = `${this.getAuthBase()}/v1/pairing/cloudpos`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        username: params.username,
        password: params.password,
        pairCode: params.pairCode,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      secret?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok || !body.secret) {
      const message =
        body.message ||
        body.error ||
        `Linkly pairing failed (${response.status})`;
      this.logger.warn(`Pairing failed: ${message}`);
      throw new BadRequestException(message);
    }

    return body.secret;
  }

  async getAuthToken(params: {
    secret: string;
    posId: string;
  }): Promise<string> {
    const url = `${this.getAuthBase()}/v1/tokens/cloudpos`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        secret: params.secret,
        posName: 'Marina POS',
        posVersion: '1.0.0',
        posId: params.posId,
        posVendorId: this.getPosVendorId(),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      token?: string;
      message?: string;
      error?: string;
    };

    if (!response.ok || !body.token) {
      const message =
        body.message ||
        body.error ||
        `Linkly auth token failed (${response.status})`;
      this.logger.warn(`Token failed: ${message}`);
      if (response.status === 401) {
        throw new BadRequestException(
          'Linkly pinpad secret is invalid. Re-pair the terminal in Payments settings.',
        );
      }
      throw new ServiceUnavailableException(message);
    }

    return body.token;
  }

  async purchase(params: {
    secret: string;
    posId: string;
    amountCents: number;
    txnRef: string;
    operatorName?: string;
  }): Promise<LinklyPurchaseResult> {
    if (params.amountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const token = await this.getAuthToken({
      secret: params.secret,
      posId: params.posId,
    });

    const sessionId = randomUUID().replace(/-/g, '');
    const txnRef = params.txnRef.replace(/\s+/g, '').slice(0, 16);
    const amtPad = String(params.amountCents).padStart(9, '0');
    const url = `${this.getRestBase()}/sessions/${sessionId}/transaction?async=false`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        Request: {
          Merchant: '00',
          TxnType: 'P',
          AmtPurchase: params.amountCents,
          TxnRef: txnRef,
          CurrencyCode: 'AUD',
          CutReceipt: '0',
          ReceiptAutoPrint: '0',
          Application: '00',
          PurchaseAnalysisData: {
            OPR: `1|${(params.operatorName ?? 'POS').slice(0, 40)}`,
            AMT: amtPad,
            PCM: '0000',
          },
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      Response?: {
        Success?: boolean;
        ResponseCode?: string;
        ResponseText?: string;
        PurchaseAnalysisData?: { RFN?: string; REF?: string };
      };
      message?: string;
      error?: string;
    };

    if (!response.ok && !body.Response) {
      const message =
        body.message ||
        body.error ||
        `Linkly purchase failed (${response.status})`;
      this.logger.warn(`Purchase HTTP error: ${message}`);
      throw new ServiceUnavailableException(message);
    }

    const txn = body.Response ?? {};
    const responseCode = (txn.ResponseCode ?? '').trim();
    const responseText = (txn.ResponseText ?? '').trim();
    const approved =
      txn.Success === true || responseCode === '00' || responseCode === '08';

    return {
      approved,
      responseCode: responseCode || String(response.status),
      responseText: responseText || (approved ? 'APPROVED' : 'DECLINED'),
      sessionId,
      txnRef,
      rfn: txn.PurchaseAnalysisData?.RFN,
      hostRef: txn.PurchaseAnalysisData?.REF,
      raw: body,
    };
  }
}
