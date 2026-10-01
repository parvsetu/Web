import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * AES-256-GCM for sensitive fields (bank account numbers, PANs).
 * Key: DATA_ENCRYPTION_KEY (32 bytes, base64). Falls back to a key derived
 * from JWT_SECRET so dev/test work out of the box — set a dedicated key in
 * production, and never rotate it without re-encrypting existing rows.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
let cached: Buffer | null = null;
function key(): Buffer {
  if (cached) return cached;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, 'base64');
    cached = k.length === 32 ? k : createHash('sha256').update(raw).digest();
  } else {
    if (process.env.NODE_ENV === 'production') new Logger('FieldCrypto').warn('DATA_ENCRYPTION_KEY not set — deriving from JWT_SECRET');
    cached = createHash('sha256').update(`parvsetu-fields:${process.env.JWT_SECRET ?? 'dev'}`).digest();
  }
  return cached;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptField(enc: string): string {
  const [v, iv, tag, ct] = enc.split('.');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const last4 = (s: string) => s.slice(-4);
