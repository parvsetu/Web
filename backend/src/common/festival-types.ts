// Presets only — Event.festivalType is a free string so a new festival never
// needs a code change ("OTHER" + a custom name works out of the box).
export const FESTIVAL_TYPES = [
  { key: 'GANESH_UTSAV', label: 'Ganesh Utsav / Ganesh Puja', defaultPrefix: 'GAN' },
  { key: 'DURGA_PUJA', label: 'Durga Puja', defaultPrefix: 'DUR' },
  { key: 'NAVRATRI', label: 'Navratri', defaultPrefix: 'NAV' },
  { key: 'JANMASHTAMI', label: 'Janmashtami', defaultPrefix: 'JAN' },
  { key: 'RAM_NAVAMI', label: 'Ram Navami', defaultPrefix: 'RAM' },
  { key: 'DUSSEHRA', label: 'Dussehra', defaultPrefix: 'DUS' },
  { key: 'DIWALI', label: 'Diwali', defaultPrefix: 'DIW' },
  { key: 'CHHATH_PUJA', label: 'Chhath Puja', defaultPrefix: 'CHH' },
  { key: 'OTHER', label: 'Other festival / community event', defaultPrefix: 'EVT' },
];

export function defaultPrefixFor(festivalType: string): string {
  const preset = FESTIVAL_TYPES.find((f) => f.key === festivalType);
  if (preset) return preset.defaultPrefix;
  const letters = festivalType.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return letters.length >= 2 ? letters : 'EVT';
}
