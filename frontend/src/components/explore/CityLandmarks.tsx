/**
 * Hand-drawn landmark postcards for popular cities (flat SVG, no external
 * images). Each city has its own sky, ground and landmark colours so the
 * picker reads like a stack of postcards rather than repeated icons.
 */
import type { ReactNode } from 'react';

export interface CityCard {
  name: string;
  landmark: string;
  tagline: string;
  /** For "use my location" → nearest city. */
  lat: number;
  lng: number;
  sky: [string, string];
  ground: string;
  art: ReactNode;
}

const S = { stroke: 'none' } as const;

/* ── Landmarks (viewBox 0 0 120 80, ground line at y=70) ─────────────── */

const HawaMahal = (
  <g {...S}>
    <path d="M22 70V38l6-6 6 6 6-8 6 8 6-10 6 10 6-8 6 8 6-6 6 6v32z" fill="#e8806b" />
    <path d="M28 70V30l4-4 4 4M52 70V22l4-4 4 4v48M76 70V30l4-4 4 4" fill="#f19a7f" />
    {[30, 40, 50, 60, 70, 80, 90].map((x) =>
      [42, 51, 60].map((y) => <rect key={`${x}-${y}`} x={x - 2} y={y} width="4" height="6" rx="2" fill="#fff3e6" opacity=".85" />),
    )}
    <path d="M56 18h8l-4-6z" fill="#c65b49" />
  </g>
);

const IndiaGate = (
  <g {...S}>
    <rect x="34" y="26" width="52" height="44" fill="#d9a066" />
    <rect x="30" y="20" width="60" height="8" fill="#c88a50" />
    <rect x="38" y="14" width="44" height="7" fill="#e3b27a" />
    <path d="M48 70V46a12 12 0 0 1 24 0v24z" fill="#7a4a24" />
    <rect x="36" y="30" width="8" height="40" fill="#e8b884" opacity=".6" />
    <rect x="76" y="30" width="8" height="40" fill="#e8b884" opacity=".6" />
    <path d="M55 14a5 4 0 0 1 10 0z" fill="#c88a50" />
  </g>
);

const Charminar = (
  <g {...S}>
    <rect x="34" y="34" width="52" height="36" fill="#e9d2a9" />
    <path d="M48 70V54a12 12 0 0 1 24 0v16z" fill="#8a6a3c" />
    {[30, 86].map((x) => (
      <g key={x}>
        <rect x={x} y="16" width="6" height="54" fill="#d8bb88" />
        <path d={`M${x - 1} 16h8l-4-8z`} fill="#c19a5e" />
        <rect x={x - 1} y="30" width="8" height="2" fill="#b38b52" />
        <rect x={x - 1} y="44" width="8" height="2" fill="#b38b52" />
      </g>
    ))}
    <rect x="38" y="38" width="44" height="4" fill="#d1b481" />
  </g>
);

const GatewayOfIndia = (
  <g {...S}>
    <rect x="30" y="28" width="60" height="42" fill="#e7c08c" />
    <path d="M50 70V48a10 10 0 0 1 20 0v22z" fill="#6c4a2a" />
    {[30, 82].map((x) => (
      <g key={x}>
        <rect x={x - 2} y="16" width="12" height="54" fill="#d9aa70" />
        <path d={`M${x - 2} 16a6 6 0 0 1 12 0z`} fill="#c48f52" />
      </g>
    ))}
    <rect x="44" y="22" width="32" height="8" fill="#d9aa70" />
    <path d="M10 74h100" stroke="#5aa7c9" strokeWidth="3" />
  </g>
);

const HowrahBridge = (
  <g {...S} fill="none" stroke="#7a5236" strokeWidth="2.5">
    <path d="M8 58h104" />
    <path d="M28 58V18M92 58V18M24 18h8M88 18h8" />
    <path d="M28 20Q60 54 92 20" />
    <path d="M8 40Q18 46 28 20M92 20Q102 46 112 40" />
    {[38, 46, 54, 62, 70, 78].map((x) => (
      <path key={x} d={`M${x} 58V${x < 60 ? 34 + (x - 38) / 2.5 : 34 + (82 - x) / 2.5}`} strokeWidth="1.5" />
    ))}
    <path d="M4 72h112" stroke="#4f8fb3" strokeWidth="5" />
  </g>
);

const ShaniwarWada = (
  <g {...S}>
    <rect x="22" y="34" width="76" height="36" fill="#c7864e" />
    {[22, 40, 58, 76, 92].map((x) => (
      <path key={x} d={`M${x} 34h8v-6l-4-3-4 3z`} fill="#b06f3a" />
    ))}
    <path d="M50 70V50a10 10 0 0 1 20 0v20z" fill="#5a3518" />
    <rect x="53" y="52" width="14" height="18" fill="#7a4a24" />
    {[56, 60, 64].map((x) => (
      <circle key={x} cx={x} cy="56" r="1" fill="#e8b884" />
    ))}
    <path d="M60 16v12" stroke="#7a4a24" strokeWidth="1.5" />
    <path d="M60 16l10 4-10 4z" fill="#f28c28" />
  </g>
);

const Deekshabhoomi = (
  <g {...S}>
    <rect x="30" y="54" width="60" height="16" fill="#e9e2d0" />
    <path d="M36 54a24 24 0 0 1 48 0z" fill="#f4efe2" />
    <path d="M44 54a16 16 0 0 1 32 0z" fill="#e2d9c2" opacity=".7" />
    <rect x="57" y="22" width="6" height="10" fill="#e9e2d0" />
    <path d="M55 22h10l-5-8z" fill="#d8c79e" />
    {[38, 48, 58, 68, 78].map((x) => (
      <rect key={x} x={x} y="58" width="4" height="10" fill="#cfc4a6" />
    ))}
  </g>
);

const KapaleeshwararGopuram = (
  <g {...S}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect key={i} x={36 + i * 3} y={60 - i * 8} width={48 - i * 6} height="9" fill={['#e05d5d', '#f2a33a', '#3fa66b', '#4d8fd6', '#e05d5d', '#f2a33a'][i]} />
    ))}
    <rect x="50" y="10" width="20" height="4" rx="2" fill="#d4a017" />
    {[52, 56, 60, 64, 68].map((x) => (
      <path key={x} d={`M${x} 10v-4`} stroke="#d4a017" strokeWidth="1.5" />
    ))}
    <path d="M54 70V62a6 6 0 0 1 12 0v8z" fill="#5a2d1a" />
  </g>
);

const VidhanaSoudha = (
  <g {...S}>
    <rect x="16" y="44" width="88" height="26" fill="#d8cbb0" />
    <rect x="34" y="36" width="52" height="10" fill="#cbbb9a" />
    <path d="M48 36a12 12 0 0 1 24 0z" fill="#bfae8a" />
    <path d="M58 24h4v-6h-4z" fill="#bfae8a" />
    {[22, 30, 38, 46, 54, 62, 70, 78, 86, 94].map((x) => (
      <rect key={x} x={x} y="48" width="3" height="20" fill="#f2ead8" />
    ))}
  </g>
);

const RumiDarwaza = (
  <g {...S}>
    <path d="M28 70V30q32-24 64 0v40z" fill="#e2b77a" />
    <path d="M44 70V44a16 16 0 0 1 32 0v26z" fill="#7b4f22" />
    <path d="M60 10l4 8h-8z" fill="#c89048" />
    {[34, 40, 46, 74, 80, 86].map((x) => (
      <rect key={x} x={x - 1} y="26" width="2" height="6" fill="#c89048" />
    ))}
    <path d="M36 30q24-16 48 0" fill="none" stroke="#c89048" strokeWidth="2" />
  </g>
);

const SidiSaiyyedJali = (
  <g {...S}>
    <path d="M30 70V34a30 30 0 0 1 60 0v36z" fill="#e3c08a" />
    <path d="M36 70V36a24 24 0 0 1 48 0v34z" fill="#7a5530" />
    <g fill="none" stroke="#f3dcae" strokeWidth="1.4">
      <path d="M60 70V30" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <path d={`M60 ${62 - i * 9}q-10-4-18 ${-6 - i}`} />
          <path d={`M60 ${62 - i * 9}q10-4 18 ${-6 - i}`} />
        </g>
      ))}
    </g>
  </g>
);

const Rajwada = (
  <g {...S}>
    <rect x="30" y="22" width="60" height="48" fill="#d9a060" />
    {[0, 1, 2, 3, 4].map((i) => (
      <rect key={i} x="30" y={22 + i * 9} width="60" height="2" fill="#b27a3b" />
    ))}
    {[36, 46, 56, 66, 76].map((x) => [26, 35, 44].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="6" height="5" rx="1" fill="#6c3f1a" />))}
    <path d="M52 70V56a8 8 0 0 1 16 0v14z" fill="#4e2a10" />
    <path d="M28 22h64l-4-4H32z" fill="#b27a3b" />
  </g>
);

const GenericSkyline = (
  <g {...S}>
    {[
      [18, 40, 14],
      [34, 30, 12],
      [48, 46, 16],
      [66, 24, 12],
      [80, 36, 14],
      [96, 44, 10],
    ].map(([x, y, w]) => (
      <rect key={x} x={x} y={y} width={w} height={70 - y} rx="1.5" fill="#94a3b8" />
    ))}
  </g>
);

export const CITY_CARDS: CityCard[] = [
  { name: 'Mumbai', landmark: 'Gateway of India', tagline: 'City of dreams', lat: 19.076, lng: 72.8777, sky: ['#ffd6a5', '#ff9f6e'], ground: '#5aa7c9', art: GatewayOfIndia },
  { name: 'Delhi', landmark: 'India Gate', tagline: 'Heart of India', lat: 28.6139, lng: 77.209, sky: ['#ffe8b5', '#f7b267'], ground: '#7cb36b', art: IndiaGate },
  { name: 'Pune', landmark: 'Shaniwar Wada', tagline: 'Peshwa pride', lat: 18.5204, lng: 73.8567, sky: ['#fde2c4', '#f59e72'], ground: '#9c6b3e', art: ShaniwarWada },
  { name: 'Kolkata', landmark: 'Howrah Bridge', tagline: 'City of joy', lat: 22.5726, lng: 88.3639, sky: ['#e0ecff', '#9ec5fe'], ground: '#4f8fb3', art: HowrahBridge },
  { name: 'Jaipur', landmark: 'Hawa Mahal', tagline: 'The pink city', lat: 26.9124, lng: 75.7873, sky: ['#ffe0e9', '#ffb3c6'], ground: '#d98c6b', art: HawaMahal },
  { name: 'Hyderabad', landmark: 'Charminar', tagline: 'City of pearls', lat: 17.385, lng: 78.4867, sky: ['#e9e4ff', '#b8a9ff'], ground: '#a68a5b', art: Charminar },
  { name: 'Nagpur', landmark: 'Deekshabhoomi', tagline: 'Orange city', lat: 21.1458, lng: 79.0882, sky: ['#fff1d6', '#ffbf69'], ground: '#f28c28', art: Deekshabhoomi },
  { name: 'Chennai', landmark: 'Kapaleeshwarar Temple', tagline: 'Gateway of the south', lat: 13.0827, lng: 80.2707, sky: ['#d9f5f0', '#8fd9cb'], ground: '#e0b56b', art: KapaleeshwararGopuram },
  { name: 'Bengaluru', landmark: 'Vidhana Soudha', tagline: 'Garden city', lat: 12.9716, lng: 77.5946, sky: ['#dcfce7', '#86efac'], ground: '#4d9e5b', art: VidhanaSoudha },
  { name: 'Ahmedabad', landmark: 'Sidi Saiyyed Jali', tagline: 'Heritage city', lat: 23.0225, lng: 72.5714, sky: ['#fff4d6', '#fcd34d'], ground: '#b7894c', art: SidiSaiyyedJali },
  { name: 'Lucknow', landmark: 'Rumi Darwaza', tagline: 'City of nawabs', lat: 26.8467, lng: 80.9462, sky: ['#fde7d9', '#f6b38e'], ground: '#b98a52', art: RumiDarwaza },
  { name: 'Indore', landmark: 'Rajwada Palace', tagline: 'Cleanest city', lat: 22.7196, lng: 75.8577, sky: ['#ffeccc', '#ffc078'], ground: '#a0662c', art: Rajwada },
];

export const cityCard = (name: string) => CITY_CARDS.find((c) => c.name.toLowerCase() === name.toLowerCase());

/** Postcard illustration: sky gradient, sun, landmark, ground. */
export function CityPostcard({ city, className }: { city: CityCard | null; className?: string }) {
  const sky = city?.sky ?? ['#f1f5f9', '#cbd5e1'];
  const id = `sky-${(city?.name ?? 'any').replace(/\W/g, '')}`;
  return (
    <svg viewBox="0 0 120 80" className={className} role="img" aria-label={city ? `${city.landmark}, ${city.name}` : 'City skyline'}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
      </defs>
      <rect width="120" height="80" fill={`url(#${id})`} />
      <circle cx="100" cy="16" r="7" fill="#fff" opacity=".7" />
      <path d="M8 22q6-4 12 0q5-3 9 1H8z" fill="#fff" opacity=".6" />
      {city?.art ?? GenericSkyline}
      <rect y="70" width="120" height="10" fill={city?.ground ?? '#94a3b8'} />
    </svg>
  );
}

/** Nearest known city to a point (great-circle distance), within ~150 km. */
export function nearestCity(lat: number, lng: number): CityCard | null {
  const rad = (d: number) => (d * Math.PI) / 180;
  let best: { c: CityCard; d: number } | null = null;
  for (const c of CITY_CARDS) {
    const dLat = rad(c.lat - lat);
    const dLng = rad(c.lng - lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(c.lat)) * Math.sin(dLng / 2) ** 2;
    const d = 6371 * 2 * Math.asin(Math.sqrt(a));
    if (!best || d < best.d) best = { c, d };
  }
  return best && best.d <= 150 ? best.c : null;
}
