// Visitor reviews, trophies/achievements and the landing page layout — API shapes.

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'HIDDEN';
export type ReportReason = 'SPAM' | 'OFFENSIVE' | 'FAKE' | 'PRIVACY' | 'OTHER';
export const REPORT_REASONS: ReportReason[] = ['SPAM', 'OFFENSIVE', 'FAKE', 'PRIVACY', 'OTHER'];

export interface ReviewPhotoRef {
  id: string;
  width: number;
  height: number;
  /** API-relative image paths. */
  url: string;
  thumbUrl: string;
}

/** An approved review as anyone can see it. */
export interface PublicReview {
  id: string;
  rating: number;
  text: string | null;
  displayName: string;
  featured: boolean;
  createdAt: string;
  event: { id: string; name: string };
  photos: ReviewPhotoRef[];
}

export interface ReviewSummary {
  average: number | null;
  count: number;
}

export interface PublicReviewPage {
  items: PublicReview[];
  total: number;
  page: number;
  pageSize: number;
  summary: ReviewSummary;
}

export interface VisitorPhoto extends ReviewPhotoRef {
  displayName: string;
  event: { id: string; name: string };
  createdAt: string;
}

export interface VisitorPhotoPage {
  items: VisitorPhoto[];
  total: number;
  page: number;
  pageSize: number;
}

/** The visitor's own review, seen from the pass page (photo URLs carry the access key). */
export interface OwnReview {
  id: string;
  status: ReviewStatus;
  rating: number;
  text: string | null;
  displayName: string;
  createdAt: string;
  updatedAt: string;
  editable: boolean;
  moderationNote: string | null;
  photos: (ReviewPhotoRef & { approved: boolean })[];
  photosRejected?: { code: string; message: string } | null;
}

export type ReviewBlockReason = 'NOT_PAID' | 'EVENT_CLOSED' | 'NOT_STARTED' | 'WINDOW_CLOSED' | null;

export interface OrderReviewState {
  canSubmit: boolean;
  reason: ReviewBlockReason;
  opensOn: string;
  closesOn: string;
  event: { id: string; name: string };
  defaultDisplayName: string;
  consent: { version: string; text: string };
  limits: { maxPhotos: number; maxText: number; maxDisplayName: number };
  review: OwnReview | null;
}

/** A review in the mandal's moderation queue. */
export interface ModReview {
  id: string;
  eventId: string;
  event: { id: string; name: string };
  passOrderId: string;
  rating: number;
  text: string | null;
  displayName: string;
  status: ReviewStatus;
  flagged: boolean;
  flagReasons: string[];
  featured: boolean;
  reportCount: number;
  autoHidden: boolean;
  autoHiddenAt: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
  moderatedBy: { id: string; name: string } | null;
  consentVersion: string;
  consentAt: string;
  createdAt: string;
  updatedAt: string;
  photos: (ReviewPhotoRef & { approved: boolean; sizeBytes: number })[];
}

export interface ReviewCounts {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
  HIDDEN: number;
  flaggedPending: number;
  reported: number;
  featured: number;
  maxFeatured: number;
}

export interface ModReviewPage {
  items: ModReview[];
  total: number;
  page: number;
  pageSize: number;
  counts: ReviewCounts;
}

export interface ReportedReview extends ModReview {
  organization: { id: string; name: string; slug: string };
  reports: { reason: ReportReason; note: string | null; createdAt: string }[];
}

// ─── Achievements ───────────────────────────────────────────────────────

export type AchievementIcon = 'TROPHY' | 'MEDAL' | 'STAR' | 'RIBBON' | 'CERTIFICATE' | 'CROWN';
export const ACHIEVEMENT_ICONS: AchievementIcon[] = ['TROPHY', 'MEDAL', 'STAR', 'RIBBON', 'CERTIFICATE', 'CROWN'];

export interface PublicAchievement {
  id: string;
  title: string;
  year: number | null;
  awardedBy: string | null;
  description: string | null;
  icon: AchievementIcon;
  imageUrl: string | null;
  thumbUrl: string | null;
}

export interface Achievement extends PublicAchievement {
  isVisible: boolean;
  sortOrder: number;
  imageSizeBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface AchievementList {
  items: Achievement[];
  max: number;
  customOrder: boolean;
}

// ─── Layout ─────────────────────────────────────────────────────────────

export type LayoutSectionId = 'hero' | 'about' | 'upcoming' | 'trophies' | 'reviews' | 'visitorPhotos' | 'gallery' | 'past' | 'sponsors' | 'contact';

export interface LayoutSection {
  id: LayoutSectionId;
  visible: boolean;
  variant: string;
}

export interface LayoutState {
  sections: LayoutSection[];
  customized: boolean;
  defaults: LayoutSection[];
  catalog: Record<LayoutSectionId, string[]>;
}
