import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

const ALGO = 'aes-256-gcm';

function resolveKey(config: ConfigService): Buffer {
  const raw =
    config.get<string>('LINKLY_SECRET_ENCRYPTION_KEY')?.trim() ||
    config.get<string>('JWT_SECRET')?.trim() ||
    'dev-linkly-encryption-key';

  return createHash('sha256').update(raw).digest();
}

/** Encrypt a pairing secret for DB storage. Format: iv:tag:ciphertext (hex). */
export function encryptLinklySecret(
  config: ConfigService,
  plaintext: string,
): string {
  const key = resolveKey(config);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptLinklySecret(
  config: ConfigService,
  payload: string,
): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid Linkly secret payload');
  }

  const key = resolveKey(config);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
