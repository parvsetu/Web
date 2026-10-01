import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const PREFIX = 'PSQR1';

/**
 * QR payload = `PSQR1.<secureToken>.<sig>`
 *   secureToken: 128-bit random, base64url, stored (unique) on the token row
 *   sig:         HMAC-SHA256(QR_SIGNING_SECRET, secureToken), first 16 bytes
 *
 * The QR carries no personal data and nothing guessable. A forged or
 * enumerated payload is rejected by the signature check before any database
 * lookup; a database leak alone can't mint valid QRs (the secret isn't
 * stored). Signatures are recomputed on demand, so QRs can be re-printed.
 */
@Injectable()
export class QrSigner {
  private secret(): string {
    const s = process.env.QR_SIGNING_SECRET;
    if (!s) throw new Error('QR_SIGNING_SECRET is not configured');
    return s;
  }

  newSecureToken(): string {
    return randomBytes(16).toString('base64url');
  }

  sign(secureToken: string): string {
    return createHmac('sha256', this.secret()).update(secureToken).digest().subarray(0, 16).toString('base64url');
  }

  payloadFor(secureToken: string): string {
    return `${PREFIX}.${secureToken}.${this.sign(secureToken)}`;
  }

  /** Returns the secureToken if the payload is well-formed and authentic. */
  verify(payload: string): string | null {
    if (typeof payload !== 'string' || payload.length > 200) return null;
    const parts = payload.trim().split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    const [, token, sig] = parts;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token) || !/^[A-Za-z0-9_-]{16,64}$/.test(sig)) return null;
    const expected = Buffer.from(this.sign(token));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return token;
  }
}
