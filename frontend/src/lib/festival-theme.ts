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
  HOLI: { label: 'Holi', from: '#EC4899', via: '#F59E0B', to: '#22C55E', soft: '#FDF2F8', ink: '#BE185D' },
  EID_UL_FITR: { label: 'Eid al-Fitr', from: '#14B8A6', via: '#0F766E', to: '#134E4A', soft: '#F0FDFA', ink: '#0F766E' },
  EID_AL_ADHA: { label: 'Eid al-Adha', from: '#14B8A6', via: '#0F766E', to: '#134E4A', soft: '#F0FDFA', ink: '#0F766E' },
  CHRISTMAS: { label: 'Christmas', from: '#DC2626', via: '#B91C1C', to: '#166534', soft: '#F0FDF4', ink: '#166534' },
  ONAM: { label: 'Onam', from: '#FACC15', via: '#F97316', to: '#15803D', soft: '#FEFCE8', ink: '#A16207' },
  MAKAR_SANKRANTI: { label: 'Makar Sankranti', from: '#38BDF8', via: '#3B82F6', to: '#F59E0B', soft: '#F0F9FF', ink: '#0369A1' },
  MELA: { label: 'Mela', from: '#EC4899', via: '#A855F7', to: '#3B82F6', soft: '#FDF4FF', ink: '#A21CAF' },
  CARNIVAL: { label: 'Carnival', from: '#F43F5E', via: '#A855F7', to: '#0EA5E9', soft: '#FFF1F2', ink: '#BE123C' },
  TRADE_EXPO: { label: 'Trade expo', from: '#0EA5E9', via: '#6366F1', to: '#1E3A8A', soft: '#EEF2FF', ink: '#3730A3' },
  CRAFT_EXHIBITION: { label: 'Craft exhibition', from: '#F59E0B', via: '#EA580C', to: '#7C2D12', soft: '#FFF7ED', ink: '#9A3412' },
  BHAGWAT_KATHA: { label: 'Bhagwat Katha', from: '#FBBF24', via: '#F97316', to: '#B45309', soft: '#FFFBEB', ink: '#B45309' },
  SATSANG: { label: 'Satsang', from: '#FBBF24', via: '#F97316', to: '#B45309', soft: '#FFFBEB', ink: '#B45309' },
  CONCERT: { label: 'Concert', from: '#8B5CF6', via: '#EC4899', to: '#F97316', soft: '#F5F3FF', ink: '#6D28D9' },
  SPORTS_TOURNAMENT: { label: 'Sports', from: '#22C55E', via: '#0EA5E9', to: '#1D4ED8', soft: '#F0FDF4', ink: '#15803D' },
  FOOD_FESTIVAL: { label: 'Food festival', from: '#F59E0B', via: '#EF4444', to: '#BE123C', soft: '#FFF7ED', ink: '#C2410C' },
  CHHATH_PUJA: { label: 'Chhath Puja', from: '#FDE047', via: '#F59E0B', to: '#EA580C', soft: '#FEFCE8', ink: '#B45309' },
};

const DEFAULT: FestivalTheme = { label: 'Festival', from: '#F59E0B', via: '#F97316', to: '#E11D48', soft: '#FFF7ED', ink: '#C2410C' };

export function festivalTheme(type?: string | null): FestivalTheme {
  return (type && THEMES[type]) || DEFAULT;
}

export function gradient(t: FestivalTheme, angle = 135) {
  return `linear-gradient(${angle}deg, ${t.from} 0%, ${t.via} 55%, ${t.to} 100%)`;
}
