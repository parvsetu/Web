/** Blogger / influencer referral API shapes (/blogger/*, /platform/bloggers, /platform/blogger-promotions). */

export type BloggerStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
export type PromotionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface Blogger {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string | null;
  bio: string | null;
  youtubeUrl: string | null;
  instagramHandle: string | null;
  blogUrl: string | null;
  audience: string | null;
  status: BloggerStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface Commission {
  mode: 'PERCENT' | 'FIXED';
  percent: string | null;
  amount: string | null;
  label: string;
  custom: boolean;
}

export interface Earnings {
  earned: string;
  reversed: string;
  paid: string;
  due: string;
}

export interface PromotionStats {
  referrals: number;
  paidBookings: number;
  visitors: number;
  gross: string;
  ticketValue: string;
  commissionEarned: string;
  commissionReversed: string;
  commissionNet: string;
}

export interface Promotion {
  id: string;
  status: PromotionStatus;
  code: string | null;
  link: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  commission: Commission;
  event: {
    id: string; name: string; festivalType: string; startDate: string; endDate: string; city: string | null; state: string | null;
    status: string; publicBookingEnabled: boolean; organization: { id: string; name: string };
  };
  stats: PromotionStats;
  /** Only in the super-admin review queue. */
  blogger?: { id: string; name: string; status: BloggerStatus; instagramHandle: string | null; youtubeUrl: string | null; blogUrl: string | null };
}

export interface BloggerOverview {
  blogger: Blogger;
  defaultCommission: Commission;
  earnings: Earnings;
  stats: { approved: number; pending: number; rejected: number; referrals: number; paidBookings: number; visitors: number };
}

export interface BloggerLedgerRow {
  id: string;
  type: 'EARNED' | 'PAID' | 'REVERSED';
  kind: 'COMMISSION' | 'PAYOUT';
  amount: string;
  createdAt: string;
  note: string | null;
  reversed: boolean;
  code: string | null;
  event: { id: string; name: string } | null;
  booking: { invoiceNo: string | null; visitors: number } | null;
}

export interface BloggerPayoutRow {
  id: string;
  amount: string;
  paidOn: string;
  reference: string;
  note: string | null;
  createdAt: string;
}

export type BloggerAdminRow = Blogger & { promotions: { approved: number; pending: number; total: number }; earnings: Earnings };

export interface BloggerDetail {
  blogger: Blogger;
  earnings: Earnings;
  defaultCommission: Commission;
  promotions: Promotion[];
}

export interface ReferralReport {
  from: string | null;
  to: string | null;
  items: (PromotionStats & { promotionId: string; blogger: string; bloggerId: string; festival: string; eventId: string; mandal: string; code: string; status: PromotionStatus })[];
  totals: PromotionStats & { paidOut: string };
}

export const BLOGGER_STATUS_LABEL: Record<BloggerStatus, string> = { PENDING: 'Waiting for review', ACTIVE: 'Approved', REJECTED: 'Not approved', SUSPENDED: 'Suspended' };
export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = { PENDING: 'Waiting for review', APPROVED: 'Approved', REJECTED: 'Not approved', REVOKED: 'Switched off' };
export const PROMOTION_TONE: Record<PromotionStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  REVOKED: 'bg-slate-200 text-slate-700',
};
