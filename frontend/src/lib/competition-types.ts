export type CompetitionKind = 'SWIMMING' | 'RUNNING' | 'DANCE' | 'ART' | 'QUIZ' | 'SPORTS' | 'OTHER';
export type ResultType = 'TIME' | 'SCORE' | 'RANK';
export type CategoryGender = 'ANY' | 'MALE' | 'FEMALE';
export type EntryStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
export type ResultStatus = 'FINISHED' | 'DNF' | 'DNS' | 'DQ';

export const COMPETITION_KINDS: CompetitionKind[] = ['SWIMMING', 'RUNNING', 'DANCE', 'ART', 'QUIZ', 'SPORTS', 'OTHER'];
export const KIND_EMOJI: Record<CompetitionKind, string> = { SWIMMING: '🏊', RUNNING: '🏃', DANCE: '💃', ART: '🎨', QUIZ: '🧠', SPORTS: '🏅', OTHER: '🏆' };

export interface PublicCategory {
  id: string;
  name: string;
  gender: CategoryGender;
  minAge: number | null;
  maxAge: number | null;
  fee: string;
  spotsLeft: number | null;
  full: boolean;
  entrants: number;
  results: { rank: number | null; name: string; city: string | null; result: string | null }[] | null;
}

export interface PublicCompetition {
  id: string;
  name: string;
  kind: CompetitionKind;
  resultType: ResultType;
  description: string | null;
  rules: string | null;
  safetyDeclaration: string | null;
  date: string;
  startTime: string;
  venue: string | null;
  setting: 'INDOOR' | 'OUTDOOR' | null;
  registrationClosesAt: string | null;
  resultsPublished: boolean;
  closedReason: string | null;
  gstOnFees: boolean;
  event: { id: string; slug: string | null; name: string; organization: string };
  categories: PublicCategory[];
}

export interface EntryView {
  id: string;
  status: EntryStatus;
  bibNo: number | null;
  participantName: string;
  ageOnDay: number;
  competition: { id: string; name: string; kind: CompetitionKind; resultType: ResultType; date: string; startTime: string; venue: string | null; resultsPublished: boolean };
  category: { id: string; name: string };
  event: { id: string; slug: string | null; name: string; organization: string; timezone: string };
  base: string;
  gstPercent: string;
  gst: string;
  amount: string;
  invoiceNo: string | null;
  paymentProvider: string;
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  checkedInAt: string | null;
  heat: number | null;
  lane: number | null;
  resultStatus: ResultStatus | null;
  result: string | null;
  rank: number | null;
  qrPayload: string | null;
  certificateAvailable: boolean;
  cancelReason: string | null;
  refund: string;
  accessKey?: string;
}

export interface Certificate {
  kind: 'WINNER' | 'PARTICIPATION';
  rank: number | null;
  participantName: string;
  category: string;
  competition: string;
  competitionKind: CompetitionKind;
  result: string | null;
  date: string;
  venue: string | null;
  event: { name: string; slug: string | null; id: string };
  organization: string;
  bibNo: number | null;
  certificateNo: string;
}

/** Organiser shapes. */
export interface AdminCategory extends Omit<PublicCategory, 'results' | 'full' | 'entrants'> {
  capacity: number | null;
  taken: number;
  isActive: boolean;
  sortOrder: number;
  paid: number;
  checkedIn: number;
}

export interface AdminCompetition extends Omit<PublicCompetition, 'categories' | 'closedReason' | 'gstOnFees' | 'event'> {
  eventId: string;
  lanes: number | null;
  registrationOpen: boolean;
  isPublished: boolean;
  sortOrder: number;
  categories: AdminCategory[];
}

export interface AdminEntry extends EntryView {
  gender: string;
  dateOfBirth: string;
  phone: string;
  email: string | null;
  city: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyName: string;
  emergencyPhone: string;
  platformFee: string;
  cancelledAt: string | null;
  refundReference: string | null;
  creditNoteNo: string | null;
  resultNote: string | null;
  resultScore: string | null;
  resultMs: number | null;
}

/** Entries this phone made (no account): kept in localStorage so people can find them again. */
const KEY = 'parvsetu.competitionEntries';
export interface SavedEntry { id: string; k: string; name: string; competition: string; at: string }
export function savedEntries(): SavedEntry[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveEntry(e: SavedEntry) {
  try {
    const list = [e, ...savedEntries().filter((x) => x.id !== e.id)].slice(0, 30);
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: the link itself still works */
  }
}
export const entryHref = (id: string, k: string) => `/compete/entry/${id}?k=${encodeURIComponent(k)}`;
