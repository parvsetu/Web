/** 80G donation-tax API shapes (/organizations/:orgId/tax-profile, /tax/year, donation tax fields). */

export type TaxProfileStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED';

export interface TaxProfile {
  urn: string;
  urnIssuedOn: string;
  validFrom: string;
  validTo: string | null;
  /** Masked, e.g. ••••••234F. */
  pan: string;
  sectionCode: string;
  deductionPercent: number | null;
  status: TaxProfileStatus;
  expired: boolean;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  updatedAt: string;
}

/** Tax state of one donation (masked ID only with DONATION_TAX_VIEW). */
export interface DonationTax {
  eligibleFor80G: boolean;
  deductionPercent: number | null;
  financialYear: string;
  ineligibleReason: string | null;
  ineligibleLabel: string | null;
  donorId?: string | null;
  idType?: string | null;
  hasDonorId?: boolean;
  donorAddress?: string | null;
}

export interface TaxYear {
  financialYear: string;
  dueDate: string;
  profile: TaxProfile | null;
  totals: { donations: string; eligible: string; eligibleDonations: number; donors: number };
  ineligible: { reason: string; label: string; count: number; amount: string }[];
  anonymous: { total: string; threshold: string; above: string };
  filing: { id: string; status: 'FILED' | 'REVISION_NEEDED'; ackNumber: string; filedOn: string; donors: number; donations: number; total: string; revisionNote: string | null } | null;
  filings: { id: string; status: string; ackNumber: string; filedOn: string; total: string; createdAt: string }[];
  donors: {
    donorKey: string; name: string; donorId: string | null; address: string | null; total: string; donations: number; receipts: string[];
    form10BE: { status: 'AWAITING_10BD' | 'READY' } | { status: 'ISSUED'; certificateNo: string; version: number; issuedAt: string };
  }[];
}

export interface DonationDocumentRow {
  id: string;
  kind: 'RECEIPT' | 'FORM_10BE';
  docNo: string;
  version: number;
  status: 'ISSUED' | 'SUPERSEDED' | 'CANCELLED';
  issuedAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

export const DONOR_ID_TYPES: { key: string; label: string; placeholder: string }[] = [
  { key: 'PAN', label: 'PAN', placeholder: 'ABCDE1234F' },
  { key: 'AADHAAR', label: 'Aadhaar', placeholder: '1234 5678 9012' },
  { key: 'PASSPORT', label: 'Passport', placeholder: 'M1234567' },
  { key: 'VOTER_ID', label: 'Voter ID', placeholder: 'ABC1234567' },
  { key: 'DRIVING_LICENSE', label: 'Driving licence', placeholder: 'MH1220110012345' },
  { key: 'RATION_CARD', label: 'Ration card', placeholder: '' },
  { key: 'TIN', label: 'Foreign tax ID (TIN)', placeholder: '' },
];

export const TAX_STATUS_LABEL: Record<TaxProfileStatus, string> = { DRAFT: 'Draft', SUBMITTED: 'Waiting for verification', VERIFIED: 'Verified', REJECTED: 'Not verified' };

/** Indian financial year of today (IST), e.g. "2026-27". */
export function currentFy(now = new Date()) {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export function recentFys(n = 4) {
  const start = Number(currentFy().slice(0, 4));
  return Array.from({ length: n }, (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, '0')}`);
}
