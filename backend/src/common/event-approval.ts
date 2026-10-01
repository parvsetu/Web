import { ConflictException } from '@nestjs/common';
import { EventApprovalStatus } from '@prisma/client';

/**
 * Platform review/payment state of an event (Event.approvalStatus):
 *
 *   DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED_AWAITING_PAYMENT ──pay──▶ LIVE
 *     ▲                  │  └─request changes─▶ CHANGES_REQUESTED ──submit──┘
 *     └──────────────────┘  └─reject─▶ REJECTED        (LIVE ──unpublish──▶ REJECTED)
 *
 * Only a LIVE event is public, bookable, can issue/scan passes, or be set ACTIVE.
 * Event.status (DRAFT/ACTIVE/COMPLETED/CANCELLED) stays the operational state.
 */
export const LIVE = 'LIVE' as const satisfies EventApprovalStatus;

/** Spread into any public/bookable `where`. */
export const LIVE_WHERE = { approvalStatus: LIVE };

/** Operational statuses a not-yet-live event may hold. */
export const PRE_LIVE_STATUSES = ['DRAFT', 'CANCELLED'] as const;

export const NOT_LIVE_MESSAGE = 'This festival is not live yet. Submit it for review and pay the registration fee to go live.';

export function assertLive(event: { approvalStatus: EventApprovalStatus }, what = 'do this') {
  if (event.approvalStatus !== LIVE) {
    throw new ConflictException({ statusCode: 409, code: 'EVENT_NOT_LIVE', message: `${NOT_LIVE_MESSAGE} (You can't ${what} before that.)` });
  }
}

/** Picks the fee for one event. Precedence: mandal override > festival type > catalog group > platform default. */
export function resolveEventFee(i: { mandalPaise?: number | null; typePaise?: number | null; groupPaise?: number | null; defaultPaise: number }) {
  if (i.mandalPaise !== null && i.mandalPaise !== undefined) return { feePaise: i.mandalPaise, source: 'MANDAL' as const };
  if (i.typePaise !== null && i.typePaise !== undefined) return { feePaise: i.typePaise, source: 'FESTIVAL_TYPE' as const };
  if (i.groupPaise !== null && i.groupPaise !== undefined) return { feePaise: i.groupPaise, source: 'GROUP' as const };
  return { feePaise: i.defaultPaise, source: 'DEFAULT' as const };
}
