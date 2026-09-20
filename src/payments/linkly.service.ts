import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PlatformSecretsService } from '../platform-secrets/platform-secrets.service';

export type LinklyTxnResult = {
  approved: boolean;
  responseCode: string;
  responseText: string;
  sessionId: string;
  txnRef: string;
  rfn?: string;
  hostRef?: string;
  raw?: unknown;
};

export type LinklyPurchaseResult = LinklyTxnResult;

export type LinklyTransactionStatusResult = {
  httpStatus: number;
  inProgress: boolean;
  notFound: boolean;
  result: LinklyTxnResult | null;
  raw?: unknown;
};

export type LinklySettlementResult = {
  success: boolean;
  responseCode: string;
  responseText: string;
  sessionId: string;
  raw?: unknown;
};

type LinklyResponseBody = {
  Response?: {
    Success?: boolean;
    ResponseCode?: string;
    ResponseText?: string;
    TxnRef?: string;
    PurchaseAnalysisData?: { RFN?: string; REF?: string };
  };
  message?: string;
  error?: string;
};

@Injectable()
export class LinklyService {
  private readonly logger = new Logger(LinklyService.name);
  private readonly posName = 'voro POS';
  private readonly posVersion = '1.0.0';
  /** Cached Cloud auth tokens keyed by secret+posId. */
  private readonly tokenCache = new Map<
    string,
    { token: string; expiresAtMs: number }
  >();

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

  /** Linkly session IDs are UUID v4 without hyphens. */
  newSessionId(): string {
    return randomUUID().replace(/-/g, '');
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
    const cacheKey = `${params.posId}:${params.secret}`;
    const cached = this.tokenCache.get(cacheKey);
    // Refresh 60s before expiry (ExpirySeconds from Linkly).
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return cached.token;
    }

    const url = `${this.getAuthBase()}/v1/tokens/cloudpos`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        secret: params.secret,
        posName: this.posName,
        posVersion: this.posVersion,
        posId: params.posId,
        posVendorId: this.getPosVendorId(),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      token?: string;
      expirySeconds?: number;
      ExpirySeconds?: number;
      message?: string;
      error?: string;
    };

    if (!response.ok || !body.token) {
      this.tokenCache.delete(cacheKey);
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

    const expirySeconds = Number(
      body.expirySeconds ?? body.ExpirySeconds ?? 3600,
    );
    const safeExpiry =
      Number.isFinite(expirySeconds) && expirySeconds > 0
        ? expirySeconds
        : 3600;
    this.tokenCache.set(cacheKey, {
      token: body.token,
      expiresAtMs: Date.now() + safeExpiry * 1000,
    });

    return body.token;
  }

  async purchase(params: {
    secret: string;
    posId: string;
    amountCents: number;
    txnRef: string;
    operatorName?: string;
    sessionId?: string;
  }): Promise<LinklyTxnResult> {
    return this.sendTransaction({
      ...params,
      txnType: 'P',
    });
  }

  /**
   * Refund (TxnType R). Requires RFN from the original approved purchase.
   * @see https://linkly.com.au/apidoc/REST/ — Refund
   */
  async refund(params: {
    secret: string;
    posId: string;
    amountCents: number;
    txnRef: string;
    rfn: string;
    operatorName?: string;
    sessionId?: string;
  }): Promise<LinklyTxnResult> {
    if (!params.rfn?.trim()) {
      throw new BadRequestException(
        'Linkly refund requires the original RFN from the purchase.',
      );
    }

    return this.sendTransaction({
      secret: params.secret,
      posId: params.posId,
      amountCents: params.amountCents,
      txnRef: params.txnRef,
      operatorName: params.operatorName,
      sessionId: params.sessionId,
      txnType: 'R',
      rfn: params.rfn.trim(),
    });
  }

  /**
   * GET transaction status for error recovery (same sessionId as original txn).
   * @see REST doc — Transaction Status / Error Recovery
   */
  async getTransactionStatus(params: {
    secret: string;
    posId: string;
    sessionId: string;
  }): Promise<LinklyTransactionStatusResult> {
    const sessionId = params.sessionId.replace(/-/g, '').trim();
    if (!sessionId) {
      throw new BadRequestException('Linkly sessionId is required.');
    }

    const token = await this.getAuthToken({
      secret: params.secret,
      posId: params.posId,
    });

    const url = `${this.getRestBase()}/sessions/${sessionId}/transaction?async=false`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 202) {
      return {
        httpStatus: 202,
        inProgress: true,
        notFound: false,
        result: null,
      };
    }

    if (response.status === 404) {
      return {
        httpStatus: 404,
        inProgress: false,
        notFound: true,
        result: null,
      };
    }

    if (response.status === 401) {
      throw new BadRequestException(
        'Linkly pinpad secret is invalid. Re-pair the terminal in Payments settings.',
      );
    }

    if (response.status === 400) {
      throw new BadRequestException(
        'Invalid Linkly transaction status request (check sessionId).',
      );
    }

    if (!response.ok) {
      const message = `Linkly transaction status failed (${response.status})`;
      this.logger.warn(message);
      throw new ServiceUnavailableException(message);
    }

    const body = (await response.json().catch(() => ({}))) as LinklyResponseBody;
    return {
      httpStatus: 200,
      inProgress: false,
      notFound: false,
      result: this.mapTxnResponse(body, sessionId, ''),
      raw: body,
    };
  }

  /**
   * Settlement (SettlementType S).
   * @see REST doc — Settlement
   */
  async settlement(params: {
    secret: string;
    posId: string;
    settlementType?: 'S' | 'P' | 'L';
    sessionId?: string;
  }): Promise<LinklySettlementResult> {
    const token = await this.getAuthToken({
      secret: params.secret,
      posId: params.posId,
    });

    const sessionId = params.sessionId ?? this.newSessionId();
    const settlementType = params.settlementType ?? 'S';
    const url = `${this.getRestBase()}/sessions/${sessionId}/settlement?async=false`;

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
          SettlementType: settlementType,
          Application: '00',
          ReceiptAutoPrint: '0',
          CutReceipt: '0',
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as LinklyResponseBody & {
      Response?: {
        Success?: boolean;
        ResponseCode?: string;
        ResponseText?: string;
      };
    };

    if (!response.ok && !body.Response) {
      const message =
        body.message ||
        body.error ||
        `Linkly settlement failed (${response.status})`;
      this.logger.warn(`Settlement HTTP error: ${message}`);
      throw new ServiceUnavailableException(message);
    }

    const txn = body.Response ?? {};
    const responseCode = (txn.ResponseCode ?? '').trim();
    const responseText = (txn.ResponseText ?? '').trim();
    const success =
      txn.Success === true || responseCode === '00' || responseCode === '08';

    return {
      success,
      responseCode: responseCode || String(response.status),
      responseText: responseText || (success ? 'OK' : 'FAILED'),
      sessionId,
      raw: body,
    };
  }

  private async sendTransaction(params: {
    secret: string;
    posId: string;
    amountCents: number;
    txnRef: string;
    operatorName?: string;
    sessionId?: string;
    txnType: 'P' | 'R';
    rfn?: string;
  }): Promise<LinklyTxnResult> {
    if (params.amountCents <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero.');
    }

    const token = await this.getAuthToken({
      secret: params.secret,
      posId: params.posId,
    });

    const sessionId = params.sessionId ?? this.newSessionId();
    const txnRef = params.txnRef.replace(/\s+/g, '').slice(0, 16);
    const amtPad = String(params.amountCents).padStart(9, '0');
    const url = `${this.getRestBase()}/sessions/${sessionId}/transaction?async=false`;

    const purchaseAnalysisData: Record<string, string> = {
      // Accreditation 1.0.1 mandatory PAD tags
      NME: this.posName.slice(0, 32),
      VER: this.posVersion.slice(0, 16),
      VND: this.getPosVendorId().slice(0, 32),
      OPR: `1|${(params.operatorName ?? 'POS').slice(0, 40)}`,
      AMT: amtPad,
      PCM: '0000',
    };
    if (params.txnType === 'R' && params.rfn) {
      purchaseAnalysisData.RFN = params.rfn;
    }

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
          TxnType: params.txnType,
          AmtPurchase: params.amountCents,
          TxnRef: txnRef,
          CurrencyCode: 'AUD',
          CutReceipt: '0',
          ReceiptAutoPrint: '0',
          Application: '00',
          PurchaseAnalysisData: purchaseAnalysisData,
        },
      }),
    });

    const body = (await response.json().catch(() => ({}))) as LinklyResponseBody;

    if (!response.ok && !body.Response) {
      const message =
        body.message ||
        body.error ||
        `Linkly ${params.txnType === 'R' ? 'refund' : 'purchase'} failed (${response.status})`;
      this.logger.warn(`Txn HTTP error: ${message}`);
      throw new ServiceUnavailableException(message);
    }

    return this.mapTxnResponse(body, sessionId, txnRef);
  }

  private mapTxnResponse(
    body: LinklyResponseBody,
    sessionId: string,
    fallbackTxnRef: string,
  ): LinklyTxnResult {
    const txn = body.Response ?? {};
    const responseCode = (txn.ResponseCode ?? '').trim();
    const responseText = (txn.ResponseText ?? '').trim();
    const approved =
      txn.Success === true || responseCode === '00' || responseCode === '08';

    return {
      approved,
      responseCode: responseCode || 'UNKNOWN',
      responseText: responseText || (approved ? 'APPROVED' : 'DECLINED'),
      sessionId,
      txnRef: (txn.TxnRef ?? fallbackTxnRef).trim() || fallbackTxnRef,
      rfn: txn.PurchaseAnalysisData?.RFN?.trim() || undefined,
      hostRef: txn.PurchaseAnalysisData?.REF?.trim() || undefined,
      raw: body,
    };
  }
}
