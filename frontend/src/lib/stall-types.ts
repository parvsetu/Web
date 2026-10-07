// Stall booking — API shapes (vendor portal, mandal Stalls tab, platform).
import type { Paged } from './types';

export type StallCategory = 'FOOD' | 'SHOPPING' | 'SERVICES' | 'EXHIBITOR' | 'OTHER';
export const STALL_CATEGORIES: StallCategory[] = ['FOOD', 'SHOPPING', 'SERVICES', 'EXHIBITOR', 'OTHER'];
export const STALL_CATEGORY_LABEL: Record<StallCategory, string> = {
  FOOD: 'Food', SHOPPING: 'Shopping', SERVICES: 'Services', EXHIBITOR: 'Exhibitor', OTHER: 'Other',
};
export type StallBookingStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface StallTypeInfo {
  id: string;
  name: string;
  category: StallCategory;
  description: string | null;
  size: string | null;
  price: string;
  totalCount: number;
  booked: number;
  available: number;
  isActive: boolean;
  sortOrder: number;
}

export interface Venue {
  name: string | null;
  city: string | null;
  state: string | null;
  fullAddress: string | null;
  mapUrl: string | null;
}

export interface StallOverview {
  enabled: boolean;
  gstEnabled: boolean;
  gstPercent: string;
  live: boolean;
  payoutsReady: boolean;
  onlinePayments: boolean;
  platformFeePercent: string;
  types: StallTypeInfo[];
  totals: { paidBookings: number; stallsSold: number; collected: string; platformFees: string };
}

export interface StallBooking {
  id: string;
  status: StallBookingStatus;
  quantity: number;
  stallType: { id: string; name: string; category: StallCategory; size: string | null };
  event: { id: string; name: string; startDate: string; endDate: string; venue: Venue; organization: { id: string; name: string } };
  unitPrice: string;
  base: string;
  gstPercent: string;
  gst: string;
  amount: string;
  businessName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  products: string | null;
  invoiceNo: string | null;
  stallNumbers: string | null;
  mandalNote: string | null;
  paymentProvider: string;
  paymentReference: string | null;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  /** Mandal view only. */
  vendorId?: string;
  platformFee?: string;
  commissionPercent?: string;
}

export interface VendorFestival {
  id: string;
  name: string;
  festivalType: string;
  startDate: string;
  endDate: string;
  venue: Venue;
  organization: { id: string; name: string };
  stallsAvailable: number;
  fromPrice: string | null;
  categories: StallCategory[];
}

export interface VendorFestivalDetail extends Omit<VendorFestival, 'stallsAvailable' | 'fromPrice' | 'categories'> {
  description: string | null;
  bookable: boolean;
  gstPercent: string | null;
  types: StallTypeInfo[];
}

export interface VendorProfile {
  id: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  category: StallCategory | null;
  description: string | null;
  city: string | null;
  gstin: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  statusNote: string | null;
  createdAt: string;
}

export interface AdminVendor extends VendorProfile {
  paidBookings: number;
  paidAmount: string;
}

export type StallBookingPage = Paged<StallBooking>;

export interface PublicStallSummary {
  open: boolean;
  types: Omit<StallTypeInfo, 'isActive' | 'sortOrder'>[];
}
