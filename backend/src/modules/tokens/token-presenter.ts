import { TokenStatus } from '@prisma/client';

export type EffectiveStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED' | 'NOT_YET_VALID';

export function effectiveStatus(t: { status: TokenStatus; validFrom: Date; validUntil: Date }, now = new Date()): EffectiveStatus {
  if (t.status === 'USED') return 'USED';
  if (t.status === 'CANCELLED') return 'CANCELLED';
  if (now >= t.validUntil) return 'EXPIRED';
  if (now < t.validFrom) return 'NOT_YET_VALID';
  return 'ACTIVE';
}

export const tokenSelect = {
  id: true, tokenCode: true, secureToken: true, sponsorIds: true, partnerCampaignIds: true, status: true, validFrom: true, validUntil: true, visitorCount: true,
  issuedAt: true, usedAt: true, cancelledAt: true, cancellationReason: true,
  timeSlot: { select: { id: true, label: true } },
  programmeItem: { select: { id: true, title: true } },
  visitor: { select: { name: true, mobile: true } },
  issuedBy: { select: { id: true, name: true } },
  usedBy: { select: { id: true, name: true } },
} as const;

type TokenRow = {
  id: string; tokenCode: string; secureToken: string; sponsorIds: string[]; partnerCampaignIds: string[]; status: TokenStatus; validFrom: Date; validUntil: Date; visitorCount: number;
  issuedAt: Date; usedAt: Date | null; cancelledAt: Date | null; cancellationReason: string | null;
  timeSlot: { id: string; label: string } | null; programmeItem: { id: string; title: string } | null; visitor: { name: string | null; mobile: string | null } | null;
  issuedBy: { id: string; name: string } | null; usedBy: { id: string; name: string } | null;
};

/** secureToken never leaves the server on its own; only inside a signed qrPayload. */
export function presentToken(t: TokenRow, qrPayload?: string) {
  const { secureToken: _s, programmeItem, ...rest } = t;
  return {
    ...rest,
    // A programme ticket shows its programme wherever the slot is shown.
    timeSlot: rest.timeSlot ?? (programmeItem ? { id: programmeItem.id, label: programmeItem.title } : null),
    programme: programmeItem,
    effectiveStatus: effectiveStatus(t), ...(qrPayload ? { qrPayload } : {}) };
}
