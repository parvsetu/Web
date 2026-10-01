// Types for the public (no-login) pass booking API — see docs/API.md,
// "Added: public pass booking (no login)". Money is a decimal string; the
// server's `amount` is the only authoritative price.

export interface BookingLocation {
  code: string;
  name: string;
  type: 'STATE' | 'UT';
  cities: string[];
}

export interface BookableEvent {
  id: string;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  state: string | null;
  city: string | null;
  /** YYYY-MM-DD in the event timezone. */
  startDate: string;
  endDate: string;
  timezone: string;
  maxVisitorsPerToken: number;
  organization: { name: string; city: string | null };
  /** Cheapest slot price, "0.00" = a free slot exists, null = no slots. */
  fromPrice: string | null;
  onlinePayments: boolean;
}

export interface BookingSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  price: string;
  capacity: number | null;
}

export interface BookableEventDetail extends BookableEvent {
  holdMinutes: number;
  slots: BookingSlot[];
}

export interface AvailabilitySlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  price: string;
  validFrom: string;
  validUntil: string;
  ended: boolean;
  /** null = unlimited; ended slots report 0. */
  remaining: number | null;
}

export interface Availability {
  date: string;
  slots: AvailabilitySlot[];
}

export type PassOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
export type PassStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'NOT_YET_VALID' | 'CANCELLED';

export interface PassOrder {
  id: string;
  status: PassOrderStatus;
  amount: string;
  unitPrice: string;
  currency: string;
  visitorCount: number;
  buyerName: string;
  buyerMobile: string;
  validFrom: string;
  validUntil: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  payment: { provider: 'demo' | 'free' | string; demo: boolean };
  event: {
    id: string;
    name: string;
    festivalType: string;
    timezone: string;
    location: string | null;
    organization: { name: string };
  };
  timeSlot: { label: string } | null;
  /** true = one QR per person; false = one group QR admitting everyone. */
  perPersonPasses?: boolean;
  /** Every pass minted for this order (empty until paid). */
  passes?: Pass[];
  /** First pass — kept by the server for single-QR clients. */
  pass: Pass | null;
}

export interface Pass {
  tokenCode: string;
  qrPayload: string;
  status: PassStatus;
  usedAt: string | null;
  /** People this QR admits. */
  admits?: number;
}

export type CreatedPassOrder = PassOrder & { accessKey: string };

export interface CreatePassOrderBody {
  eventId: string;
  timeSlotId: string;
  date: string;
  visitorCount: number;
  buyerName: string;
  buyerMobile: string;
  buyerEmail?: string;
  /** Server default: true (one QR per person). */
  perPersonPasses?: boolean;
}

/** What we keep on this device so /book/my-passes can find a buyer's passes. */
export interface SavedPass {
  orderId: string;
  accessKey: string;
  eventName: string;
  createdAt: string;
}
