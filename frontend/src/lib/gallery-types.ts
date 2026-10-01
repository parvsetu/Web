export interface Photo {
  id: string;
  eventId: string;
  caption: string | null;
  isPublic: boolean;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
  takenAt: string | null;
  createdAt: string;
  /** Authenticated API paths (fetch with the bearer token). */
  url: string;
  thumbUrl: string;
  /** Plain image paths while the photo is public. */
  publicUrl: string | null;
  publicThumbUrl: string | null;
}

export interface PublicPhoto {
  id: string;
  eventId: string;
  caption: string | null;
  width: number;
  height: number;
  takenAt: string | null;
  url: string;
  thumbUrl: string;
}

export interface GalleryUsage {
  usedBytes: number;
  quotaBytes: number;
  photos: number;
}

export interface GallerySummary {
  usage: GalleryUsage;
  years: {
    year: number;
    events: { id: string; name: string; festivalType: string; startDate: string; endDate: string; status: string; photos: number; publicPhotos: number; sizeBytes: number; coverThumbUrl: string | null }[];
  }[];
}
