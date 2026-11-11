// Shapes returned by the Parvsetu API (see docs/API.md). Only the fields the
// app reads are listed; the server sends more.

export type PassStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'NOT_YET_VALID' | 'CANCELLED';
export type PassOrderStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';

export interface BookableEvent {
  id: string;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  state: string | null;
  city: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  maxVisitorsPerToken: number;
  organization: { name: string; city: string | null };
  fromPrice: string | null;
  onlinePayments: boolean;
  bookingOpensAt?: string | null;
  bookingClosesAt?: string | null;
}

export interface Slot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  price: string;
}

export interface BookableEventDetail extends BookableEvent {
  holdMinutes: number;
  slots: (Slot & { capacity: number | null })[];
}

export interface Availability {
  date: string;
  slots: (Slot & { validFrom: string; validUntil: string; ended: boolean; remaining: number | null })[];
}

export interface Pass {
  tokenCode: string;
  qrPayload: string;
  status: PassStatus;
  usedAt: string | null;
  admits?: number;
}

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
  payment: { provider: string; demo: boolean };
  refund?: { cancelledAt: string | null; reason: string | null; amount: string; state: 'NONE' | 'TO_SEND' | 'SENT'; reference: string | null } | null;
  event: {
    id: string;
    name: string;
    festivalType: string;
    timezone: string;
    location: string | null;
    passInstructions?: string | null;
    organization: { name: string };
  };
  timeSlot: { label: string } | null;
  programme?: { title: string; date: string; startTime: string; stage: string | null } | null;
  passes?: Pass[];
  pass: Pass | null;
}

export type CreatedPassOrder = PassOrder & { accessKey: string };

export interface SavedPass {
  orderId: string;
  accessKey: string;
  eventName: string;
  createdAt: string;
}

export interface MeEvent {
  id: string;
  name: string;
  festivalType: string;
  status: string;
  approvalStatus?: string;
  startDate: string;
  endDate: string;
  timezone: string;
  organization: { id: string; name: string };
  permissions: string[];
}

export interface MeUser {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  isSuperAdmin: boolean;
  events: MeEvent[];
}

export type ScanResult = 'SUCCESS' | 'ALREADY_USED' | 'EXPIRED' | 'NOT_YET_VALID' | 'CANCELLED' | 'INVALID' | 'WRONG_EVENT';

export interface ScanResponse {
  success: boolean;
  result: ScanResult;
  status: string | null;
  message: string;
  tokenCode: string | null;
  usedAt: string | null;
  scannedBy: { id: string; name: string } | null;
  validFrom: string | null;
  validUntil: string | null;
  visitorCount: number | null;
  timeSlot: { label: string } | null;
  scannedAt: string;
  replayed: boolean;
}
