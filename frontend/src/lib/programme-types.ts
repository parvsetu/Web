export type ProgrammeCategory = 'PERFORMANCE' | 'PUJA' | 'CULTURAL' | 'COMPETITION' | 'CHIEF_GUEST' | 'WORKSHOP' | 'OTHER';
export type ProgrammeSetting = 'INDOOR' | 'OUTDOOR';

export const PROGRAMME_CATEGORIES: ProgrammeCategory[] = ['PERFORMANCE', 'PUJA', 'CULTURAL', 'COMPETITION', 'CHIEF_GUEST', 'WORKSHOP', 'OTHER'];

/** Badge colours per category (public page + admin). */
export const CATEGORY_STYLE: Record<ProgrammeCategory, string> = {
  PERFORMANCE: 'bg-fuchsia-100 text-fuchsia-800',
  PUJA: 'bg-amber-100 text-amber-900',
  CULTURAL: 'bg-sky-100 text-sky-800',
  COMPETITION: 'bg-emerald-100 text-emerald-800',
  CHIEF_GUEST: 'bg-rose-100 text-rose-800',
  WORKSHOP: 'bg-indigo-100 text-indigo-800',
  OTHER: 'bg-slate-100 text-slate-700',
};

export interface ProgrammeGuest {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  instagramUrl: string | null;
  /** API-relative; public route on the public page, authorised route in admin. */
  photoUrl: string | null;
}

export interface ProgrammeVideo {
  provider: 'YOUTUBE' | 'INSTAGRAM';
  url: string;
  embedUrl: string;
}

export interface ProgrammeItem {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  category: ProgrammeCategory;
  description: string | null;
  setting: ProgrammeSetting | null;
  stage: string | null;
  language: string | null;
  ageLimit: string | null;
  video: ProgrammeVideo | null;
  posterUrl: string | null;
  isHeadline: boolean;
  status: 'SCHEDULED' | 'CANCELLED';
  statusNote: string | null;
  guests: ProgrammeGuest[];
}

export interface AdminProgrammeItem extends ProgrammeItem {
  videoUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

export interface PublicProgramme {
  startDate: string;
  endDate: string;
  timezone: string;
  days: { date: string; dayNumber: number; title: string | null; subtitle: string | null; items: ProgrammeItem[] }[];
  headliners: { itemId: string; date: string; startTime: string; title: string; category: ProgrammeCategory; name: string; role: string | null; photoUrl: string | null }[];
}

export interface AdminProgramme {
  startDate: string;
  endDate: string;
  timezone: string;
  days: { date: string; inRange: boolean; title: string | null; subtitle: string | null; items: AdminProgrammeItem[] }[];
}
