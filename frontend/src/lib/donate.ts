// Public (no-login) donations on a festival page. Same request path as booking
// (retries, slow-server notice, friendly errors); the server decides amounts,
// 80G eligibility and payment state.

import { publicApi } from './booking';
import type { OrgBrand } from './media';

export interface DonateEventInfo {
  id: string;
  name: string;
  festivalType: string;
  startDate: string;
  endDate: string;
  organization: { name: string } & OrgBrand;
  /** false = a gateway or the mandal's verified payout account is missing. */
  onlinePayments: boolean;
  /** The mandal's verified 80G deduction (50/100), or null. */
  deduction80G: number | null;
  minAmount: string;
  maxAmount: string;
  suggestedAmounts: number[];
  holdMinutes: number;
}

export interface PublicDonation {
  id: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  amount: string;
  currency: string;
  donorName: string | null;
  isAnonymous: boolean;
  receiptNo: string | null;
  createdAt: string;
  expiresAt: string;
  payment: { provider: string; demo: boolean };
  /** /r/<id>?k=… once paid. */
  receiptPath: string | null;
  event: { id: string; name: string; festivalType: string; organization: { name: string } & OrgBrand };
}

export interface CreatePublicDonationBody {
  eventId: string;
  donorName?: string;
  isAnonymous?: boolean;
  donorMobile?: string;
  donorEmail?: string;
  amount: string;
  taxId?: { idType: string; idNumber: string; address?: string };
}

export const donate = {
  event: (eventId: string) => publicApi.get<DonateEventInfo>(`/public/donations/events/${encodeURIComponent(eventId)}`),
  create: (body: CreatePublicDonationBody) => publicApi.post<PublicDonation & { accessKey: string }>('/public/donations', body),
  get: (id: string, k: string) => publicApi.get<PublicDonation>(`/public/donations/${encodeURIComponent(id)}`, { k }),
  demoPay: (id: string, k: string, outcome: 'success' | 'fail') =>
    publicApi.post<PublicDonation>(`/public/donations/${encodeURIComponent(id)}/demo-pay`, { k, outcome }),
};

export const donateHref = (eventId: string) => `/donate/${encodeURIComponent(eventId)}`;
export const donationPayHref = (id: string, k: string) => `/pay/donation/${encodeURIComponent(id)}?k=${encodeURIComponent(k)}`;
