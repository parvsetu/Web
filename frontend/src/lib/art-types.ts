export type ArtMode = 'DISPLAY' | 'SALE';
export type SaleStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';

export interface PublicArtwork {
  id: string;
  title: string;
  artistName: string;
  artistBio: string | null;
  artistInstagram: string | null;
  medium: string | null;
  widthCm: string | null;
  heightCm: string | null;
  depthCm: string | null;
  year: number | null;
  description: string | null;
  mode: ArtMode;
  price: string | null;
  saleStatus: SaleStatus;
  isFeatured: boolean;
  imageWidth: number | null;
  imageHeight: number | null;
  /** API-relative. */
  imageUrl: string | null;
  thumbUrl: string | null;
}

export interface AdminArtwork extends PublicArtwork {
  isPublished: boolean;
  sortOrder: number;
  soldAt: string | null;
  imageSizeBytes: number;
  enquiries: number;
  newEnquiries: number;
}

export interface ArtEnquiry {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  message: string | null;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  note: string | null;
  createdAt: string;
  artwork: { id: string; title: string; artistName: string; price: string | null; saleStatus: SaleStatus };
}
