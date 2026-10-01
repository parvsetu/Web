// Types mirroring docs/API.md (Parvsetu API v1). Keep in step with the contract.

export type Permission =
  | 'USER_VIEW' | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE'
  | 'VOLUNTEER_VIEW' | 'VOLUNTEER_CREATE' | 'VOLUNTEER_UPDATE' | 'VOLUNTEER_DELETE' | 'VOLUNTEER_ASSIGN'
  | 'EVENT_VIEW' | 'EVENT_CREATE' | 'EVENT_UPDATE' | 'EVENT_DELETE'
  | 'TOKEN_VIEW' | 'TOKEN_CREATE' | 'TOKEN_GENERATE' | 'TOKEN_SCAN' | 'TOKEN_MANUAL_ENTRY' | 'TOKEN_CANCEL' | 'TOKEN_REACTIVATE'
  | 'DONATION_VIEW' | 'DONATION_CREATE' | 'DONATION_UPDATE'
  | 'EXPENSE_VIEW' | 'EXPENSE_CREATE' | 'EXPENSE_UPDATE'
  | 'REPORT_VIEW' | 'REPORT_EXPORT'
  | 'ROLE_VIEW' | 'ROLE_CREATE' | 'ROLE_UPDATE' | 'ROLE_DELETE'
  | 'SETTINGS_VIEW' | 'SETTINGS_UPDATE'
  | 'AUDIT_VIEW';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  code?: string;
  result?: string;
  success?: boolean;
}

export interface IdName {
  id: string;
  name: string;
}

export interface RoleRef {
  id: string;
  key: string;
  name: string;
}

export type EventStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface MeOrganization {
  id: string;
  name: string;
  slug: string;
  role: RoleRef | null;
  permissions: string[];
}

export interface MeEvent {
  id: string;
  name: string;
  festivalType: string;
  status: EventStatus;
  startDate: string;
  endDate: string;
  timezone: string;
  organization: IdName;
  permissions: string[];
}

export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;

export interface Application {
  id: string;
  status: ApplicationStatus;
  organization: IdName;
  event: IdName | null;
  createdAt: string;
  reviewNote: string | null;
  // Present on the org-admin list (not documented precisely; optional).
  message?: string | null;
  user?: { id: string; name: string; mobile?: string | null; email?: string | null } | null;
}

export interface MeUser {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  isSuperAdmin: boolean;
  status: string;
  emailVerified?: boolean;
  organizations: MeOrganization[];
  events: MeEvent[];
  applications: Application[];
}

export interface AuthResponse {
  accessToken: string;
  user: MeUser;
}

export interface PublicEvent {
  id: string;
  name: string;
  festivalType: string;
  startDate: string;
  endDate: string;
  location: string | null;
  organization: IdName;
}

export interface FestivalType {
  key: string;
  label: string;
  defaultPrefix: string;
}

export interface Organization {
  id: string;
  name: string;
  slug?: string;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  createdAt?: string;
}

export interface Member {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
  status: string;
  role: RoleRef;
  createdAt: string;
}

export interface PermissionDef {
  key: string;
  group: string;
  description: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  organizationId: string | null;
  permissions: string[];
  memberCount: number;
  assignmentCount: number;
}

export interface VolunteerAssignmentRef {
  id: string;
  eventId: string;
  eventName: string;
  role: RoleRef;
  status: string;
}

export interface Volunteer {
  userId: string;
  name: string;
  mobile: string | null;
  email: string | null;
  accountStatus: string;
  assignments: VolunteerAssignmentRef[];
}

/** Shape of an event assignment row — not fully specified in API.md; fields are optional-tolerant. */
export interface Assignment {
  id: string;
  userId?: string;
  status: string;
  role: RoleRef;
  user?: { id: string; name: string; mobile?: string | null; email?: string | null };
  name?: string;
  mobile?: string | null;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
  actor: IdName | null;
  eventId: string | null;
}

export interface EventDetail {
  id: string;
  organizationId: string;
  organization: IdName;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  state?: string | null;
  city?: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  status: EventStatus;
  tokenPrefix: string;
  volunteerRegistrationOpen: boolean;
  publicBookingEnabled?: boolean;
  tokenDurationOptions?: number[];
  maxVisitorsPerToken: number;
  createdAt: string;
  myPermissions: string[];
}

export interface EventBody {
  name: string;
  festivalType: string;
  description?: string;
  location?: string;
  startDate: string;
  endDate: string;
  timezone?: string;
  status?: EventStatus;
  tokenPrefix?: string;
  volunteerRegistrationOpen?: boolean;
  publicBookingEnabled?: boolean;
  tokenDurationOptions?: number[];
  maxVisitorsPerToken?: number;
  state?: string;
  city?: string;
}

export interface TimeSlot {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number | null;
  isActive: boolean;
  sortOrder: number;
  crossesMidnight: boolean;
  /** Per-person price for public booking ("0.00" = free). */
  price?: string;
}

export type TokenStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'CANCELLED';
export type EffectiveTokenStatus = TokenStatus | 'NOT_YET_VALID';

export interface Token {
  sponsorIds?: string[];
  id: string;
  tokenCode: string;
  status: TokenStatus;
  effectiveStatus: EffectiveTokenStatus;
  validFrom: string;
  validUntil: string;
  visitorCount: number;
  timeSlot: { id: string; label: string } | null;
  visitor: { name: string | null; mobile: string | null } | null;
  issuedAt: string;
  issuedBy: IdName | null;
  usedAt: string | null;
  usedBy: IdName | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface TokenWithQr extends Token {
  qrPayload: string;
}

export interface TokenDetail extends TokenWithQr {
  scans: ScanLogRow[];
}

export type Validity =
  | { timeSlotId: string; date: string }
  | { validFrom: string; validUntil: string }
  | { durationHours: number; startAt?: string };

export type ScanResult =
  | 'SUCCESS'
  | 'ALREADY_USED'
  | 'EXPIRED'
  | 'NOT_YET_VALID'
  | 'CANCELLED'
  | 'INVALID'
  | 'WRONG_EVENT';

export interface ScanResponse {
  success: boolean;
  result: ScanResult;
  status: TokenStatus | null;
  message: string;
  tokenCode: string | null;
  usedAt: string | null;
  scannedBy: IdName | null;
  validFrom: string | null;
  validUntil: string | null;
  visitorCount: number | null;
  timeSlot: { label: string } | null;
  scannedAt: string;
  replayed: boolean;
}

export interface ScanLogRow {
  id: string;
  scanTime: string;
  result: ScanResult | 'UNAUTHORIZED' | string;
  method: string;
  failureReason: string | null;
  tokenCode: string | null;
  user: IdName;
  voided: boolean;
}

export interface MySummary {
  event: { id: string; name: string; festivalType: string; status: EventStatus };
  today: { date: string; entries: number; visitors: number };
  me: {
    scans: number;
    successful: number;
    duplicate: number;
    expired: number;
    notYetValid: number;
    invalid: number;
    other: number;
    lastActiveAt: string | null;
  };
}

export interface PaymentProvider {
  key: string;
  label: string;
  online: boolean;
}

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | string;

export interface Donation {
  id: string;
  receiptNo: string | null;
  donorName: string;
  donorMobile: string | null;
  donorEmail: string | null;
  amount: string;
  currency: string;
  method: string;
  paymentStatus: PaymentStatus;
  paymentProvider: string | null;
  paymentReference: string | null;
  donatedAt: string;
  notes: string | null;
  createdBy: IdName | null;
}

export interface DonationCreateResponse extends Donation {
  payment?: { provider: string; providerOrderId: string; checkoutUrl?: string; upiUri?: string };
  /** Entry passes issued with this donation (if requested). */
  passes?: { id: string; tokenCode: string; qrPayload: string; visitorCount: number; status: string; validFrom: string; validUntil: string }[];
}

export interface Receipt {
  receiptNo: string;
  organization: { name: string; city: string | null; address: string | null };
  event: { name: string };
  donorName: string;
  amount: string;
  amountInWords: string;
  method: string;
  paymentReference: string | null;
  donatedAt: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: string;
  expenseDate: string;
  vendor: string | null;
  receiptRef: string | null;
  createdBy: IdName | null;
  createdAt: string;
}

export interface TokensReport {
  total: number;
  active: number;
  used: number;
  expired: number;
  cancelled: number;
  notYetValid: number;
  bySlot: { timeSlotId: string | null; label: string; total: number; used: number; active: number; expired: number; cancelled: number }[];
}

export interface VisitorsReport {
  totalVisitors: number;
  totalEntries: number;
  bySlot: { timeSlotId: string | null; label: string; entries: number; visitors: number }[];
  byDate: { date: string; entries: number; visitors: number }[];
  byHour: { hour: number; entries: number; visitors: number }[];
}

export interface ScansReport {
  total: number;
  success: number;
  alreadyUsed: number;
  expired: number;
  notYetValid: number;
  cancelled: number;
  invalid: number;
  wrongEvent: number;
  unauthorized: number;
}

export interface VolunteerStats {
  userId: string;
  name: string;
  total: number;
  successful: number;
  duplicate: number;
  expired: number;
  notYetValid: number;
  invalid: number;
  other: number;
  failed: number;
  lastActiveAt: string | null;
}

export interface VolunteerActivity {
  user: IdName;
  stats: VolunteerStats;
  recentScans: ScanLogRow[];
}

export interface FinanceReport {
  donations: { total: string; count: number; byMethod: { method: string; total: string; count: number }[]; pending: { total: string; count: number } };
  passSales?: { total: string; count: number; visitors: number };
  expenses: { total: string; count: number; byCategory: { category: string; total: string; count: number }[] };
  balance: string;
}

export interface SummaryReport {
  event: IdName;
  tokens: { total: number; used: number; unused: number; expired: number; cancelled: number };
  visitors: { total: number; entries: number };
  scans: { total: number; success: number; failed: number };
  donations: { total: string; count: number } | null;
  passSales?: { total: string; count: number; visitors: number } | null;
  expenses: { total: string; count: number } | null;
  balance: string | null;
  restricted: string[];
}

export interface Dashboard {
  date: string;
  today: { visitors: number; entries: number; tokensIssued: number; used: number; unused: number; expired: number; cancelled: number };
  overall: SummaryReport;
  volunteerActivity: VolunteerStats[];
  recentScans: ScanLogRow[];
  hourly: { hour: number; entries: number }[];
}

export interface PlatformUser {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  status: string;
  isSuperAdmin: boolean;
  createdAt: string;
}
