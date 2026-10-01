import type { ApprovalStatus, EventApproval, RegistrationStatus } from './types';

export interface FeePayment {
  id: string;
  amount: string;
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  method: string | null;
  paymentReference: string | null;
  note: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  refundedAt: string | null;
  refundReason: string | null;
  /** Shareable pay link while it can still be paid. */
  payUrl: string | null;
}

export interface RequestedEvent {
  index: number;
  festivalType: string | null;
  custom: { name: string; group: string; description: string | null } | null;
  name: string;
  startDate: string;
  endDate: string;
  location: string | null;
  venueAddress: string | null;
  quotedFee: string;
  feeSource: string;
}

export interface RegistrationEventState {
  id: string;
  name: string;
  festivalType: string;
  startDate: string;
  endDate: string;
  approvalStatus: ApprovalStatus;
  status: string;
  fee: string | null;
  payment: FeePayment | null;
}

export interface MandalRegistration {
  id: string;
  status: RegistrationStatus;
  source: 'SELF' | 'AGENT';
  orgName: string;
  state: string | null;
  city: string | null;
  address: string | null;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  referralCode: string | null;
  agent: { id: string; name: string; code: string } | null;
  organization: { id: string; name: string; slug: string } | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  requestedEvents: RequestedEvent[];
  events: RegistrationEventState[];
  declarations?: { version: string; acceptedAt: string; onBehalf: boolean; ipAddress: string | null }[];
}

export interface EventApprovalDetail extends EventApproval {
  quote: { fee: string; source: string };
  customFestival: { label: string; group: string; status: string; inCatalog: boolean } | null;
  payments: FeePayment[];
  canSubmit: boolean;
}

export interface ReviewEvent {
  id: string;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  venueAddress: string | null;
  city: string | null;
  state: string | null;
  startDate: string;
  endDate: string;
  status: string;
  organization: { id: string; name: string; city: string | null; state: string | null; agent: { id: string; name: string; code: string } | null };
  approval: EventApproval;
  customFestival: { label: string; group: string; description: string | null; status: string; inCatalog: boolean } | null;
  passesIssued: number;
  payments: FeePayment[];
}

export interface ContentPolicy {
  version: string;
  rule: string;
  declaration: string;
  notAllowed: string[];
  consequences: string[];
}

export interface AgentInfo {
  id: string;
  name: string;
  phone: string;
  email: string;
  code: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  referralLink: string;
  userId: string | null;
}

export interface AgentOverview {
  agent: AgentInfo;
  rates: { referralFee: string; referralFeeCustom: boolean; commissionPercent: string; commissionCustom: boolean };
  stats: { registered: number; pending: number; approved: number; rejected: number; mandals: number; liveMandals: number; liveEvents: number };
  earnings: { earned: string; reversed: string; paid: string; due: string };
}

export interface AttributedMandal {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  attributedAt: string | null;
  events: RegistrationEventState[];
}

export interface AgentLedgerRow {
  id: string;
  type: 'EARNED' | 'PAID' | 'REVERSED';
  kind: 'REGISTRATION' | 'COMMISSION' | 'PAYOUT';
  amount: string;
  createdAt: string;
  note: string | null;
  reversed: boolean;
  organization: { id: string; name: string } | null;
  event: { id: string; name: string } | null;
}

export interface AgentPayoutRow {
  id: string;
  amount: string;
  paidOn: string;
  reference: string;
  note: string | null;
  createdAt: string;
}

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: 'Draft — not submitted',
  SUBMITTED: 'Under platform review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED_AWAITING_PAYMENT: 'Approved — fee due',
  LIVE: 'Live',
  REJECTED: 'Rejected',
};

export const REGISTRATION_LABEL: Record<RegistrationStatus, string> = {
  PENDING_VERIFICATION: 'Email not verified',
  PENDING_REVIEW: 'Under review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
