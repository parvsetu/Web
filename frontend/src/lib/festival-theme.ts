/** Colour identity per festival. Unknown types get the saffron default. */
export interface FestivalTheme {
  label: string;
  /** Banner gradient stops. */
  from: string;
  via: string;
  to: string;
  /** Light tint for cards/backgrounds. */
  soft: string;
  /** Readable accent on white. */
  ink: string;
}

const THEMES: Record<string, FestivalTheme> = {
  GANESH_UTSAV: { label: 'Ganesh Utsav', from: '#F59E0B', via: '#F97316', to: '#DC2626', soft: '#FFF7ED', ink: '#C2410C' },
  DURGA_PUJA: { label: 'Durga Puja', from: '#DC2626', via: '#B91C1C', to: '#7F1D1D', soft: '#FEF2F2', ink: '#B91C1C' },
  NAVRATRI: { label: 'Navratri', from: '#EC4899', via: '#C026D3', to: '#7C3AED', soft: '#FDF4FF', ink: '#A21CAF' },
  JANMASHTAMI: { label: 'Janmashtami', from: '#0EA5E9', via: '#2563EB', to: '#4338CA', soft: '#EFF6FF', ink: '#1D4ED8' },
  RAM_NAVAMI: { label: 'Ram Navami', from: '#FBBF24', via: '#F97316', to: '#EA580C', soft: '#FFFBEB', ink: '#C2410C' },
  DUSSEHRA: { label: 'Dussehra', from: '#F59E0B', via: '#EA580C', to: '#991B1B', soft: '#FFF7ED', ink: '#9A3412' },
  DIWALI: { label: 'Diwali', from: '#F59E0B', via: '#DB2777', to: '#4C1D95', soft: '#FFFBEB', ink: '#9D174D' },
  CHHATH_PUJA: { label: 'Chhath Puja', from: '#FDE047', via: '#F59E0B', to: '#EA580C', soft: '#FEFCE8', ink: '#B45309' },
};

const DEFAULT: FestivalTheme = { label: 'Festival', from: '#F59E0B', via: '#F97316', to: '#E11D48', soft: '#FFF7ED', ink: '#C2410C' };

export function festivalTheme(type?: string | null): FestivalTheme {
  return (type && THEMES[type]) || DEFAULT;
}

export function gradient(t: FestivalTheme, angle = 135) {
  return `linear-gradient(${angle}deg, ${t.from} 0%, ${t.via} 55%, ${t.to} 100%)`;
}
