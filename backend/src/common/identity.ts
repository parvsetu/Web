import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';

export function normalizeMobile(raw: string): string {
  const m = (raw ?? '').replace(/[\s\-()]/g, '');
  if (!/^\+?\d{10,15}$/.test(m)) throw new BadRequestException('Enter a valid mobile number');
  return m;
}

export function normalizeEmail(raw?: string | null): string | null {
  if (!raw) return null;
  return raw.trim().toLowerCase();
}

/** Readable one-time password for admin-created accounts (no 0/O/1/l). */
export function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
