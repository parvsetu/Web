// Mandal landing page (/m/<slug>) — types and the fixed theme palette.
import type { PublicPhoto } from './gallery-types';
import type { SponsorPublic } from '@/components/SponsorStrip';
import type { LayoutSection, PublicAchievement, PublicReview, ReviewSummary, VisitorPhoto } from './review-types';

export const LANDING_THEMES: Record<string, { label: string; from: string; via: string; to: string; ink: string; soft: string }> = {
  saffron: { label: 'Saffron', from: '#f59e0b', via: '#f97316', to: '#e11d48', ink: '#c2410c', soft: '#fff7ed' },
  crimson: { label: 'Crimson', from: '#f43f5e', via: '#dc2626', to: '#7f1d1d', ink: '#b91c1c', soft: '#fef2f2' },
  marigold: { label: 'Marigold', from: '#fde047', via: '#f59e0b', to: '#ea580c', ink: '#b45309', soft: '#fffbeb' },
  peacock: { label: 'Peacock', from: '#06b6d4', via: '#0d9488', to: '#1e3a8a', ink: '#0f766e', soft: '#ecfeff' },
  emerald: { label: 'Emerald', from: '#4ade80', via: '#059669', to: '#064e3b', ink: '#047857', soft: '#ecfdf5' },
  royal: { label: 'Royal blue', from: '#60a5fa', via: '#2563eb', to: '#312e81', ink: '#1d4ed8', soft: '#eff6ff' },
  magenta: { label: 'Magenta', from: '#f472b6', via: '#db2777', to: '#701a75', ink: '#be185d', soft: '#fdf2f8' },
  indigo: { label: 'Indigo', from: '#a78bfa', via: '#6d28d9', to: '#1e1b4b', ink: '#6d28d9', soft: '#f5f3ff' },
};

export const landingTheme = (key: string | null | undefined) => LANDING_THEMES[key ?? ''] ?? LANDING_THEMES.saffron;

export interface LandingContent {
  enabled: boolean;
  headline: string | null;
  about: string | null;
  highlights: string[];
  contactPhone: string | null;
  contactEmail: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  youtubeUrl: string | null;
  whatsappNumber: string | null;
  featuredEventIds: string[];
  photoIds: string[];
  themeColor: string;
  layout: LayoutSection[];
}

export interface LandingPurchase {
  id: string;
  amount: string;
  years: number;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  paidUntil: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface LandingStatus {
  state: 'NOT_ACTIVE' | 'ACTIVE' | 'EXPIRED' | 'DISABLED';
  paidUntil: string | null;
  price: string;
  slug: string;
  publicPath: string;
  demoPayments: boolean;
  content: LandingContent;
  purchases: LandingPurchase[];
}

export interface LandingEventCard {
  id: string;
  name: string;
  festivalType: string;
  description: string | null;
  location: string | null;
  city: string | null;
  startDate: string;
  endDate: string;
  status: string;
  bookable: boolean;
  fromPrice: string | null;
}

export interface LandingPublic {
  slug: string;
  preview: boolean;
  organization: { id: string; name: string; city: string | null; state: string | null; address: string | null; logoUrl: string | null; bannerUrl: string | null };
  theme: string;
  headline: string | null;
  about: string | null;
  highlights: string[];
  contact: { phone: string | null; email: string | null };
  social: { instagram: string | null; facebook: string | null; youtube: string | null; whatsapp: string | null };
  upcoming: LandingEventCard[];
  past: { year: number; events: LandingEventCard[] }[];
  photos: PublicPhoto[];
  sponsors: SponsorPublic[];
  achievements: PublicAchievement[];
  reviews: ReviewSummary & { items: PublicReview[]; total: number };
  visitorPhotos: { items: VisitorPhoto[]; total: number };
  /** Section order / visibility / variant as the mandal saved it (normalized by the server). */
  layout: LayoutSection[];
}

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

/** Server-side fetch of a live landing page (cached 5 minutes); null when not available. */
export async function getLandingPage(slug: string): Promise<LandingPublic | null> {
  try {
    const res = await fetch(`${API}/public/landing/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as LandingPublic) : null;
  } catch {
    return null;
  }
}
