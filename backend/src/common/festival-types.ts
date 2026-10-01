// Presets only — Event.festivalType is a free string so a new festival never
// needs a code change ("OTHER" + a custom name works out of the box).
// `group` drives the grouped dropdown; `months` is the usual time of year
// (lunar-calendar festivals move every year) — shown as a hint only.

export interface FestivalTypeDef {
  key: string;
  label: string;
  defaultPrefix: string;
  group:
    | 'Hindu' | 'Muslim' | 'Sikh' | 'Christian' | 'Buddhist' | 'Jain' | 'Parsi' | 'Regional & Harvest'
    | 'Religious Gatherings' | 'Fairs & Carnivals' | 'Exhibitions & Trade' | 'Cultural & Entertainment' | 'Community & Sports'
    | 'National & Cultural' | 'Other';
  months?: string;
}

export const FESTIVAL_TYPES: FestivalTypeDef[] = [
  // Hindu
  { key: 'GANESH_UTSAV', label: 'Ganesh Utsav / Ganesh Chaturthi', defaultPrefix: 'GAN', group: 'Hindu', months: 'Aug–Sep' },
  { key: 'DURGA_PUJA', label: 'Durga Puja', defaultPrefix: 'DUR', group: 'Hindu', months: 'Sep–Oct' },
  { key: 'NAVRATRI', label: 'Navratri / Garba', defaultPrefix: 'NAV', group: 'Hindu', months: 'Sep–Oct' },
  { key: 'DUSSEHRA', label: 'Dussehra / Vijayadashami', defaultPrefix: 'DUS', group: 'Hindu', months: 'Oct' },
  { key: 'DIWALI', label: 'Diwali / Deepavali', defaultPrefix: 'DIW', group: 'Hindu', months: 'Oct–Nov' },
  { key: 'KALI_PUJA', label: 'Kali Puja', defaultPrefix: 'KAL', group: 'Hindu', months: 'Oct–Nov' },
  { key: 'LAKSHMI_PUJA', label: 'Lakshmi Puja', defaultPrefix: 'LAK', group: 'Hindu', months: 'Oct' },
  { key: 'CHHATH_PUJA', label: 'Chhath Puja', defaultPrefix: 'CHH', group: 'Hindu', months: 'Oct–Nov' },
  { key: 'HOLI', label: 'Holi', defaultPrefix: 'HOL', group: 'Hindu', months: 'Mar' },
  { key: 'JANMASHTAMI', label: 'Krishna Janmashtami / Dahi Handi', defaultPrefix: 'JAN', group: 'Hindu', months: 'Aug–Sep' },
  { key: 'RAM_NAVAMI', label: 'Ram Navami', defaultPrefix: 'RAM', group: 'Hindu', months: 'Mar–Apr' },
  { key: 'HANUMAN_JAYANTI', label: 'Hanuman Jayanti', defaultPrefix: 'HAN', group: 'Hindu', months: 'Mar–Apr' },
  { key: 'MAHA_SHIVARATRI', label: 'Maha Shivaratri', defaultPrefix: 'SHV', group: 'Hindu', months: 'Feb–Mar' },
  { key: 'SARASWATI_PUJA', label: 'Saraswati Puja / Vasant Panchami', defaultPrefix: 'SAR', group: 'Hindu', months: 'Jan–Feb' },
  { key: 'RAKSHA_BANDHAN', label: 'Raksha Bandhan', defaultPrefix: 'RAK', group: 'Hindu', months: 'Aug' },
  { key: 'KARVA_CHAUTH', label: 'Karva Chauth', defaultPrefix: 'KAR', group: 'Hindu', months: 'Oct–Nov' },
  { key: 'TEEJ', label: 'Teej', defaultPrefix: 'TEJ', group: 'Hindu', months: 'Jul–Aug' },
  { key: 'RATH_YATRA', label: 'Rath Yatra', defaultPrefix: 'RTH', group: 'Hindu', months: 'Jun–Jul' },
  { key: 'KUMBH_MELA', label: 'Kumbh Mela', defaultPrefix: 'KUM', group: 'Hindu', months: 'Varies' },
  { key: 'GURU_PURNIMA', label: 'Guru Purnima', defaultPrefix: 'GUP', group: 'Hindu', months: 'Jul' },
  { key: 'NAG_PANCHAMI', label: 'Nag Panchami', defaultPrefix: 'NAG', group: 'Hindu', months: 'Jul–Aug' },
  { key: 'VISHWAKARMA_PUJA', label: 'Vishwakarma Puja', defaultPrefix: 'VIS', group: 'Hindu', months: 'Sep' },
  { key: 'KARTIK_PURNIMA', label: 'Kartik Purnima / Dev Deepawali', defaultPrefix: 'KTK', group: 'Hindu', months: 'Nov' },
  // Regional & harvest
  { key: 'MAKAR_SANKRANTI', label: 'Makar Sankranti / Uttarayan', defaultPrefix: 'MAK', group: 'Regional & Harvest', months: 'Jan' },
  { key: 'PONGAL', label: 'Pongal', defaultPrefix: 'PON', group: 'Regional & Harvest', months: 'Jan' },
  { key: 'LOHRI', label: 'Lohri', defaultPrefix: 'LOH', group: 'Regional & Harvest', months: 'Jan' },
  { key: 'BIHU', label: 'Bihu', defaultPrefix: 'BIH', group: 'Regional & Harvest', months: 'Apr / Oct / Jan' },
  { key: 'ONAM', label: 'Onam', defaultPrefix: 'ONM', group: 'Regional & Harvest', months: 'Aug–Sep' },
  { key: 'UGADI', label: 'Ugadi', defaultPrefix: 'UGA', group: 'Regional & Harvest', months: 'Mar–Apr' },
  { key: 'GUDI_PADWA', label: 'Gudi Padwa', defaultPrefix: 'GUD', group: 'Regional & Harvest', months: 'Mar–Apr' },
  { key: 'VISHU', label: 'Vishu', defaultPrefix: 'VSU', group: 'Regional & Harvest', months: 'Apr' },
  { key: 'POHELA_BOISHAKH', label: 'Pohela Boishakh (Bengali New Year)', defaultPrefix: 'POH', group: 'Regional & Harvest', months: 'Apr' },
  { key: 'PUTHANDU', label: 'Puthandu (Tamil New Year)', defaultPrefix: 'PUT', group: 'Regional & Harvest', months: 'Apr' },
  { key: 'HORNBILL', label: 'Hornbill Festival', defaultPrefix: 'HRN', group: 'Regional & Harvest', months: 'Dec' },
  { key: 'HEMIS', label: 'Hemis Festival', defaultPrefix: 'HEM', group: 'Regional & Harvest', months: 'Jun–Jul' },
  { key: 'THRISSUR_POORAM', label: 'Thrissur Pooram', defaultPrefix: 'POO', group: 'Regional & Harvest', months: 'Apr–May' },
  { key: 'BONALU', label: 'Bonalu', defaultPrefix: 'BON', group: 'Regional & Harvest', months: 'Jul–Aug' },
  { key: 'BATHUKAMMA', label: 'Bathukamma', defaultPrefix: 'BAT', group: 'Regional & Harvest', months: 'Sep–Oct' },
  // Sikh
  { key: 'BAISAKHI', label: 'Baisakhi / Vaisakhi', defaultPrefix: 'BAI', group: 'Sikh', months: 'Apr' },
  { key: 'GURU_NANAK_JAYANTI', label: 'Guru Nanak Jayanti / Gurpurab', defaultPrefix: 'GNJ', group: 'Sikh', months: 'Nov' },
  { key: 'HOLA_MOHALLA', label: 'Hola Mohalla', defaultPrefix: 'HLM', group: 'Sikh', months: 'Mar' },
  // Muslim
  { key: 'EID_UL_FITR', label: 'Eid al-Fitr', defaultPrefix: 'EIF', group: 'Muslim', months: 'Varies (lunar)' },
  { key: 'EID_AL_ADHA', label: 'Eid al-Adha / Bakrid', defaultPrefix: 'EIA', group: 'Muslim', months: 'Varies (lunar)' },
  { key: 'MILAD_UN_NABI', label: 'Milad-un-Nabi', defaultPrefix: 'MIL', group: 'Muslim', months: 'Varies (lunar)' },
  { key: 'MUHARRAM', label: 'Muharram', defaultPrefix: 'MUH', group: 'Muslim', months: 'Varies (lunar)' },
  // Christian
  { key: 'CHRISTMAS', label: 'Christmas', defaultPrefix: 'XMS', group: 'Christian', months: 'Dec' },
  { key: 'EASTER', label: 'Easter', defaultPrefix: 'EAS', group: 'Christian', months: 'Mar–Apr' },
  // Buddhist / Jain / Parsi
  { key: 'BUDDHA_PURNIMA', label: 'Buddha Purnima', defaultPrefix: 'BUD', group: 'Buddhist', months: 'Apr–May' },
  { key: 'LOSAR', label: 'Losar', defaultPrefix: 'LOS', group: 'Buddhist', months: 'Feb–Mar' },
  { key: 'MAHAVIR_JAYANTI', label: 'Mahavir Jayanti', defaultPrefix: 'MAH', group: 'Jain', months: 'Mar–Apr' },
  { key: 'PARYUSHAN', label: 'Paryushan / Das Lakshana', defaultPrefix: 'PAR', group: 'Jain', months: 'Aug–Sep' },
  { key: 'NAVROZ', label: 'Navroz (Parsi New Year)', defaultPrefix: 'NVZ', group: 'Parsi', months: 'Mar / Aug' },
  // Religious gatherings (not tied to one festival)
  { key: 'BHAGWAT_KATHA', label: 'Bhagwat / Ram Katha', defaultPrefix: 'KTH', group: 'Religious Gatherings' },
  { key: 'SATSANG', label: 'Satsang / Pravachan', defaultPrefix: 'SAT', group: 'Religious Gatherings' },
  { key: 'JAGRAN', label: 'Jagran / Mata ki Chowki', defaultPrefix: 'JAG', group: 'Religious Gatherings' },
  { key: 'KIRTAN', label: 'Kirtan / Bhajan Sandhya', defaultPrefix: 'KIR', group: 'Religious Gatherings' },
  { key: 'YAGNA', label: 'Yagna / Havan', defaultPrefix: 'YAG', group: 'Religious Gatherings' },
  { key: 'BHANDARA', label: 'Bhandara / Langar / Annadanam', defaultPrefix: 'BHN', group: 'Religious Gatherings' },
  // Fairs & carnivals
  { key: 'MELA', label: 'Mela / Village fair', defaultPrefix: 'MEL', group: 'Fairs & Carnivals' },
  { key: 'CARNIVAL', label: 'Carnival', defaultPrefix: 'CAR', group: 'Fairs & Carnivals' },
  { key: 'PUSHKAR_FAIR', label: 'Cattle / Camel fair (e.g. Pushkar)', defaultPrefix: 'PUS', group: 'Fairs & Carnivals' },
  { key: 'KIDS_FUN_FAIR', label: 'Kids fun fair / Amusement fair', defaultPrefix: 'FUN', group: 'Fairs & Carnivals' },
  { key: 'FOOD_FESTIVAL', label: 'Food festival', defaultPrefix: 'FOD', group: 'Fairs & Carnivals' },
  // Exhibitions & trade
  { key: 'TRADE_EXPO', label: 'Trade fair / Expo', defaultPrefix: 'EXP', group: 'Exhibitions & Trade' },
  { key: 'CRAFT_EXHIBITION', label: 'Handicraft & handloom exhibition', defaultPrefix: 'CRF', group: 'Exhibitions & Trade' },
  { key: 'BOOK_FAIR', label: 'Book fair', defaultPrefix: 'BOK', group: 'Exhibitions & Trade' },
  { key: 'AGRI_EXPO', label: 'Kisan / Agriculture expo', defaultPrefix: 'AGR', group: 'Exhibitions & Trade' },
  { key: 'ART_EXHIBITION', label: 'Art exhibition', defaultPrefix: 'ART', group: 'Exhibitions & Trade' },
  { key: 'EDUCATION_FAIR', label: 'Education / Career fair', defaultPrefix: 'EDU', group: 'Exhibitions & Trade' },
  { key: 'PROPERTY_EXPO', label: 'Property / Auto expo', defaultPrefix: 'PRP', group: 'Exhibitions & Trade' },
  // Cultural & entertainment
  { key: 'CONCERT', label: 'Music concert', defaultPrefix: 'CON', group: 'Cultural & Entertainment' },
  { key: 'DANCE_FESTIVAL', label: 'Dance festival / Garba night', defaultPrefix: 'DNC', group: 'Cultural & Entertainment' },
  { key: 'RAMLILA', label: 'Ramlila / Drama', defaultPrefix: 'RML', group: 'Cultural & Entertainment' },
  { key: 'KAVI_SAMMELAN', label: 'Kavi Sammelan / Mushaira', defaultPrefix: 'KAV', group: 'Cultural & Entertainment' },
  { key: 'COMEDY_SHOW', label: 'Comedy / Stage show', defaultPrefix: 'SHW', group: 'Cultural & Entertainment' },
  // Community & sports
  { key: 'SPORTS_TOURNAMENT', label: 'Sports tournament', defaultPrefix: 'SPT', group: 'Community & Sports' },
  { key: 'MARATHON', label: 'Marathon / Walkathon', defaultPrefix: 'RUN', group: 'Community & Sports' },
  { key: 'HEALTH_CAMP', label: 'Health / Blood donation camp', defaultPrefix: 'HLT', group: 'Community & Sports' },
  { key: 'COMMUNITY_MEET', label: 'Community sammelan / Meet', defaultPrefix: 'MET', group: 'Community & Sports' },
  // National & cultural
  { key: 'INDEPENDENCE_DAY', label: 'Independence Day', defaultPrefix: 'IND', group: 'National & Cultural', months: 'Aug 15' },
  { key: 'REPUBLIC_DAY', label: 'Republic Day', defaultPrefix: 'REP', group: 'National & Cultural', months: 'Jan 26' },
  { key: 'CULTURAL_FEST', label: 'Cultural programme / Mela', defaultPrefix: 'CUL', group: 'National & Cultural' },
  { key: 'OTHER', label: 'Other festival / community event', defaultPrefix: 'EVT', group: 'Other' },
];

export function defaultPrefixFor(festivalType: string): string {
  const preset = FESTIVAL_TYPES.find((f) => f.key === festivalType);
  if (preset) return preset.defaultPrefix;
  const letters = festivalType.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return letters.length >= 2 ? letters : 'EVT';
}

/** Common mandal expense heads (UI suggestions; any category is accepted). */
export const EXPENSE_CATEGORIES = [
  'Idol / Murti', 'Pandal & Stage', 'Decoration & Flowers', 'Lighting', 'Sound & DJ', 'Electricity', 'Bhog / Prasad', 'Pooja & Priest',
  'Cultural programme', 'Security', 'Cleaning & Sanitation', 'Water', 'Printing & Publicity', 'Transport', 'Permissions & Fees',
  'Rent', 'Insurance', 'Volunteer food & refreshments', 'Visarjan / Immersion', 'Charity & Seva', 'Miscellaneous',
];
