// Promotional partners (brands that pay the platform per printed pass). Mirrors docs/API.md.

export type PartnerStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type CampaignStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'ENDED' | 'CANCELLED';
/** Whether an APPROVED campaign actually prints right now. */
export type PrintingState = 'LIVE' | 'SCHEDULED' | 'EXPIRED' | 'CAP_REACHED' | 'PARTNER_INACTIVE' | 'WALLET_EMPTY';
export type WalletState = 'OK' | 'LOW' | 'EXHAUSTED';

export interface PartnerProfile {
  id: string;
  name: string;
  legalName: string | null;
  gstin: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string | null;
  tagline: string | null;
  logoUrl: string | null;
  status: PartnerStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  walletBalance: string;
  totalRecharged: string;
  totalSpent: string;
  createdAt: string;
}

export interface PartnerWallet {
  state: WalletState;
  message: string | null;
  passesLeft: number | null;
}

export interface PartnerOverview {
  partner: PartnerProfile;
  wallet: PartnerWallet;
  stats: { approved: number; requested: number; paused: number; passesPrinted: number; spent: string };
}

export interface PartnerCampaign {
  id: string;
  status: CampaignStatus;
  printing: PrintingState | null;
  message: string;
  startDate: string;
  endDate: string;
  maxPasses: number | null;
  rate: string;
  passesPrinted: number;
  spent: string;
  estimate: string | null;
  organization: { id: string; name: string; city: string | null; state: string | null };
  event: { id: string; name: string; festivalType: string; startDate: string; endDate: string } | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  /** Super admin view only. */
  partner?: { id: string; name: string; status: PartnerStatus; walletBalance: string };
}

export interface PartnerMandal {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  ratePerPass: string;
  events: { id: string; name: string; festivalType: string; startDate: string; endDate: string; status: string; city: string | null }[];
}

export interface PartnerTx {
  id: string;
  createdAt: string;
  type: 'RECHARGE' | 'PASS_PRINT' | 'REFUND' | 'ADJUSTMENT';
  amount: string;
  balanceAfter: string;
  tokenCount: number;
  note: string | null;
  campaignId: string | null;
  organization: { id: string; name: string } | null;
  event: { id: string; name: string } | null;
}

export interface PartnerRecharge {
  id: string;
  amount: string;
  status: string;
  paymentReference: string | null;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string;
}

export interface AdminPartnerRow extends PartnerProfile {
  login: { email: string | null; mobile: string; emailVerified: boolean } | null;
  wallet: PartnerWallet;
  campaigns: Partial<Record<CampaignStatus, number>>;
}

export const PRINTING_LABEL: Record<PrintingState, { label: string; cls: string }> = {
  LIVE: { label: 'Printing now', cls: 'bg-emerald-100 text-emerald-800' },
  SCHEDULED: { label: 'Scheduled', cls: 'bg-sky-100 text-sky-800' },
  EXPIRED: { label: 'Dates over', cls: 'bg-slate-200 text-slate-700' },
  CAP_REACHED: { label: 'Cap reached', cls: 'bg-violet-100 text-violet-800' },
  PARTNER_INACTIVE: { label: 'Account not active', cls: 'bg-amber-100 text-amber-800' },
  WALLET_EMPTY: { label: 'Wallet too low', cls: 'bg-red-100 text-red-800' },
};

export const TX_LABEL: Record<PartnerTx['type'], string> = { RECHARGE: 'Recharge', PASS_PRINT: 'Passes printed', REFUND: 'Refund', ADJUSTMENT: 'Adjustment' };
