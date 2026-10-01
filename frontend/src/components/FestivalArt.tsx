/**
 * Hand-drawn festival illustrations (64×64 viewBox, self-coloured so they
 * read on both the gradient banners and plain white cards). Pick one with
 * <FestivalArt type={event.festivalType} />; unknown types fall back to a
 * marigold, so a brand-new festival still gets art without a code change.
 */
import type { ReactElement } from 'react';

type Art = () => ReactElement;

const Ganesh: Art = () => (
  <>
    {/* ears */}
    <ellipse cx="13" cy="31" rx="11" ry="14" fill="#F97316" />
    <ellipse cx="51" cy="31" rx="11" ry="14" fill="#F97316" />
    <ellipse cx="14.5" cy="31" rx="6.5" ry="9" fill="#FDBA74" />
    <ellipse cx="49.5" cy="31" rx="6.5" ry="9" fill="#FDBA74" />
    {/* crown */}
    <path d="M21 16 L24 8 L28 12 L32 3 L36 12 L40 8 L43 16 Z" fill="#FACC15" />
    <circle cx="32" cy="10.5" r="2" fill="#DC2626" />
    <rect x="20" y="14.5" width="24" height="4" rx="2" fill="#EAB308" />
    {/* head */}
    <path d="M20 18 H44 A3 3 0 0 1 47 21 V32 A15 15 0 0 1 17 32 V21 A3 3 0 0 1 20 18 Z" fill="#FB923C" />
    {/* tilak */}
    <path d="M29 21.5 Q32 27 35 21.5" stroke="#DC2626" strokeWidth="2" fill="none" strokeLinecap="round" />
    <circle cx="32" cy="27" r="1.4" fill="#DC2626" />
    {/* eyes */}
    <path d="M23 30 Q26 27.5 29 30 Q26 32 23 30 Z" fill="#fff" />
    <path d="M35 30 Q38 27.5 41 30 Q38 32 35 30 Z" fill="#fff" />
    <circle cx="26" cy="30" r="1.5" fill="#1F2937" />
    <circle cx="38" cy="30" r="1.5" fill="#1F2937" />
    {/* tusk */}
    <path d="M27 38 Q24 42 25 45" stroke="#FFF7ED" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* trunk, curling to the side */}
    <path d="M32 35 C32 47 31 55 37 58 C42 60.5 46 57 43 53.5" stroke="#FB923C" strokeWidth="7.5" fill="none" strokeLinecap="round" />
    <path d="M29.5 44 h5 M29.5 48.5 h5" stroke="#F97316" strokeWidth="1.3" strokeLinecap="round" />
  </>
);

const Durga: Art = () => (
  <>
    {/* halo */}
    <circle cx="32" cy="32" r="30" fill="#FDE68A" />
    <circle cx="32" cy="32" r="26" fill="#DC2626" />
    {/* hair */}
    <path d="M11 36 C11 18 21 9 32 9 C43 9 53 18 53 36 C53 48 47 56 32 58 C17 56 11 48 11 36 Z" fill="#1F2937" />
    {/* crown */}
    <path d="M18 20 L22 9 L26 15 L32 4 L38 15 L42 9 L46 20 Z" fill="#FACC15" />
    <circle cx="32" cy="12" r="2" fill="#DC2626" />
    <circle cx="22.5" cy="14" r="1.2" fill="#16A34A" />
    <circle cx="41.5" cy="14" r="1.2" fill="#16A34A" />
    {/* face */}
    <path d="M18 24 C18 21 22 19 32 19 C42 19 46 21 46 24 V36 C46 46 40 53 32 53 C24 53 18 46 18 36 Z" fill="#FCD34D" />
    {/* third eye + sindoor */}
    <path d="M32 21.5 Q34 25.5 32 29 Q30 25.5 32 21.5 Z" fill="#DC2626" />
    {/* brows */}
    <path d="M21 30 Q26 26.5 30 29.5 M34 29.5 Q38 26.5 43 30" stroke="#1F2937" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    {/* large almond eyes */}
    <path d="M20 34 Q25.5 29.5 30.5 34 Q25.5 37.5 20 34 Z" fill="#fff" stroke="#1F2937" strokeWidth="1.4" />
    <path d="M33.5 34 Q38.5 29.5 44 34 Q38.5 37.5 33.5 34 Z" fill="#fff" stroke="#1F2937" strokeWidth="1.4" />
    <circle cx="25.5" cy="33.8" r="2" fill="#1F2937" />
    <circle cx="38.5" cy="33.8" r="2" fill="#1F2937" />
    {/* nose ring + lips */}
    <path d="M32 37 V42" stroke="#D97706" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="34.5" cy="42.5" r="2.4" fill="none" stroke="#EAB308" strokeWidth="1.2" />
    <path d="M28 46.5 Q32 49.5 36 46.5 Q32 45 28 46.5 Z" fill="#B91C1C" />
    {/* earrings */}
    <circle cx="17.5" cy="41" r="2.2" fill="#FACC15" />
    <circle cx="46.5" cy="41" r="2.2" fill="#FACC15" />
  </>
);

const Navratri: Art = () => (
  <>
    {/* garbo pot */}
    <path d="M20 40 C14 46 16 58 32 59 C48 58 50 46 44 40 Z" fill="#DB2777" />
    <rect x="22" y="36" width="20" height="5" rx="2" fill="#F472B6" />
    <circle cx="26" cy="49" r="2" fill="#FDE047" />
    <circle cx="32" cy="51" r="2" fill="#FDE047" />
    <circle cx="38" cy="49" r="2" fill="#FDE047" />
    <path d="M19 45 Q32 50 45 45" stroke="#FDE047" strokeWidth="1.4" fill="none" />
    {/* diya flame on the pot */}
    <path d="M32 24 C28 29 29 34 32 35 C35 34 36 29 32 24 Z" fill="#F59E0B" />
    <path d="M32 28 C30.5 31 31 33.5 32 34 C33 33.5 33.5 31 32 28 Z" fill="#FEF08A" />
    {/* crossed dandiya sticks */}
    <g strokeLinecap="round">
      <path d="M8 6 L28 30" stroke="#7C3AED" strokeWidth="4" />
      <path d="M56 6 L36 30" stroke="#16A34A" strokeWidth="4" />
      <path d="M11.5 10 l3 -2.5 M16 15.5 l3 -2.5 M20.5 21 l3 -2.5" stroke="#FDE047" strokeWidth="2" />
      <path d="M52.5 10 l-3 -2.5 M48 15.5 l-3 -2.5 M43.5 21 l-3 -2.5" stroke="#FDE047" strokeWidth="2" />
    </g>
  </>
);

const Janmashtami: Art = () => (
  <>
    {/* peacock feather */}
    <path d="M44 58 C40 40 38 24 46 6" stroke="#15803D" strokeWidth="2" fill="none" strokeLinecap="round" />
    <path d="M46 8 C58 14 58 30 45 34 C34 31 34 15 46 8 Z" fill="#16A34A" />
    <ellipse cx="45.5" cy="21" rx="7" ry="9" fill="#0EA5E9" />
    <ellipse cx="45.5" cy="22" rx="4.5" ry="6" fill="#1D4ED8" />
    <ellipse cx="45.5" cy="22.5" rx="2.3" ry="3.2" fill="#0F172A" />
    <path d="M38 12 l-4 -3 M37 18 l-5 -1 M37 25 l-5 1 M54 13 l4 -3 M55 20 l5 -1 M54 27 l4 2" stroke="#22C55E" strokeWidth="1.3" strokeLinecap="round" />
    {/* flute */}
    <path d="M4 50 L50 36" stroke="#B45309" strokeWidth="6" strokeLinecap="round" />
    <path d="M4 50 L50 36" stroke="#D97706" strokeWidth="3.5" strokeLinecap="round" />
    <g fill="#78350F">
      <circle cx="16" cy="46.4" r="1.2" />
      <circle cx="22" cy="44.6" r="1.2" />
      <circle cx="28" cy="42.8" r="1.2" />
      <circle cx="34" cy="41" r="1.2" />
    </g>
    <path d="M40 39 l2 6 M43 38 l2 6" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M42 44 C40 50 44 54 46 56 M45 43 C45 50 49 52 51 53" stroke="#DC2626" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </>
);

const RamNavami: Art = () => (
  <>
    {/* sun */}
    <circle cx="18" cy="18" r="9" fill="#FACC15" />
    <g stroke="#FACC15" strokeWidth="2.4" strokeLinecap="round">
      <path d="M18 3 v4 M18 29 v4 M3 18 h4 M29 18 h4 M7.5 7.5 l2.8 2.8 M25.7 25.7 l2.8 2.8 M7.5 28.5 l2.8 -2.8 M25.7 10.3 l2.8 -2.8" />
    </g>
    {/* temple shikhara */}
    <path d="M26 58 V44 C26 34 32 26 32 18 C32 26 38 34 38 44 V58 Z" fill="#EA580C" />
    <path d="M16 58 V48 C16 43 20 40 22 37 C24 40 28 43 28 48 V58 Z" fill="#F97316" />
    <path d="M36 58 V48 C36 43 40 40 42 37 C44 40 48 43 48 48 V58 Z" fill="#F97316" />
    <rect x="12" y="56" width="40" height="4" rx="1" fill="#9A3412" />
    <path d="M29.5 58 V51 a2.5 2.5 0 0 1 5 0 V58 Z" fill="#7C2D12" />
    {/* saffron flag */}
    <path d="M32 18 V4" stroke="#7C2D12" strokeWidth="1.5" />
    <path d="M32 4 L46 7.5 L32 11.5 Z" fill="#F97316" />
  </>
);

const Dussehra: Art = () => (
  <>
    {/* bow */}
    <path d="M14 6 C34 14 34 50 14 58" stroke="#92400E" strokeWidth="4.5" fill="none" strokeLinecap="round" />
    <path d="M14 6 V58" stroke="#FDE68A" strokeWidth="1.3" />
    {/* flaming arrow */}
    <path d="M10 32 H50" stroke="#475569" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M10 32 l-5 -4 M10 32 l-5 4" stroke="#DC2626" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M50 26 L60 32 L50 38 Z" fill="#475569" />
    <path d="M47 32 C47 22 53 18 56 12 C58 20 62 24 60 32 Z" fill="#F97316" />
    <path d="M50.5 32 C50.5 26 54 23 55.5 19 C57 24 59 27 58 32 Z" fill="#FACC15" />
  </>
);

const Diwali: Art = () => (
  <>
    {/* glow */}
    <circle cx="32" cy="22" r="16" fill="#FEF3C7" />
    {/* flame */}
    <path d="M32 6 C25 16 26 26 32 28 C38 26 39 16 32 6 Z" fill="#F59E0B" />
    <path d="M32 13 C29 19 29.5 24.5 32 25.5 C34.5 24.5 35 19 32 13 Z" fill="#FDE047" />
    {/* diya */}
    <path d="M6 34 C10 52 54 52 58 34 C48 38 16 38 6 34 Z" fill="#C2410C" />
    <path d="M10 37 C16 46 48 46 54 37" stroke="#FDBA74" strokeWidth="1.6" fill="none" />
    <path d="M28 30 h8 v4 h-8 z" fill="#78350F" />
    <g fill="#FACC15">
      <circle cx="20" cy="42" r="1.6" />
      <circle cx="32" cy="45" r="1.6" />
      <circle cx="44" cy="42" r="1.6" />
    </g>
    {/* rangoli dots */}
    <g fill="#DB2777">
      <circle cx="12" cy="56" r="2" />
      <circle cx="22" cy="58" r="2" />
      <circle cx="42" cy="58" r="2" />
      <circle cx="52" cy="56" r="2" />
    </g>
    <circle cx="32" cy="58.5" r="2" fill="#7C3AED" />
  </>
);

const Chhath: Art = () => (
  <>
    {/* rising sun */}
    <path d="M10 40 A22 22 0 0 1 54 40 Z" fill="#F97316" />
    <path d="M16 40 A16 16 0 0 1 48 40 Z" fill="#FACC15" />
    <g stroke="#F97316" strokeWidth="2.4" strokeLinecap="round">
      <path d="M32 6 v6 M12 14 l4 4 M52 14 l-4 4 M3 30 h5 M56 30 h5" />
    </g>
    {/* water */}
    <path d="M2 44 Q9 40 16 44 T30 44 T44 44 T58 44 T62 44" stroke="#0EA5E9" strokeWidth="3" fill="none" strokeLinecap="round" />
    <path d="M2 52 Q9 48 16 52 T30 52 T44 52 T58 52 T62 52" stroke="#38BDF8" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* soop (offering basket) */}
    <path d="M22 54 C24 61 40 61 42 54 Z" fill="#CA8A04" />
    <circle cx="28" cy="55" r="1.6" fill="#DC2626" />
    <circle cx="32" cy="54.4" r="1.6" fill="#16A34A" />
    <circle cx="36" cy="55" r="1.6" fill="#DC2626" />
  </>
);

/** Marigold — the generic festive fallback. */
const Marigold: Art = () => (
  <>
    {Array.from({ length: 12 }, (_, i) => (
      <ellipse key={`o${i}`} cx="32" cy="12" rx="6" ry="11" fill="#F97316" transform={`rotate(${i * 30} 32 32)`} />
    ))}
    {Array.from({ length: 12 }, (_, i) => (
      <ellipse key={`i${i}`} cx="32" cy="18" rx="4.5" ry="8" fill="#FBBF24" transform={`rotate(${i * 30 + 15} 32 32)`} />
    ))}
    <circle cx="32" cy="32" r="7" fill="#EA580C" />
    <circle cx="32" cy="32" r="3.5" fill="#FDE047" />
  </>
);

const ART: Record<string, Art> = {
  GANESH_UTSAV: Ganesh,
  DURGA_PUJA: Durga,
  NAVRATRI: Navratri,
  JANMASHTAMI: Janmashtami,
  RAM_NAVAMI: RamNavami,
  DUSSEHRA: Dussehra,
  DIWALI: Diwali,
  CHHATH_PUJA: Chhath,
};

export function FestivalArt({ type, className, title }: { type?: string | null; className?: string; title?: string }) {
  const Comp = (type && ART[type]) || Marigold;
  return (
    <svg viewBox="0 0 64 64" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <Comp />
    </svg>
  );
}

/** Parvsetu mark: a lit diya on a saffron disc. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="ps-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#DC2626" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ps-logo)" />
      <path d="M32 10 C26 19 27 27 32 29 C37 27 38 19 32 10 Z" fill="#FEF08A" />
      <path d="M32 16 C30 21 30.5 25 32 26 C33.5 25 34 21 32 16 Z" fill="#fff" />
      <path d="M12 34 C16 50 48 50 52 34 C43 38 21 38 12 34 Z" fill="#fff" />
      <path d="M17 39 C22 45 42 45 47 39" stroke="#F59E0B" strokeWidth="2" fill="none" />
    </svg>
  );
}

/** A strip of marigold-and-mango-leaf garland (toran) for banner tops. */
export function Toran({ className }: { className?: string }) {
  return (
    <svg className={className} aria-hidden preserveAspectRatio="none" height="18">
      <defs>
        <pattern id="ps-toran" width="36" height="18" patternUnits="userSpaceOnUse">
          <path d="M0 3 Q18 9 36 3" stroke="#15803D" strokeWidth="1.5" fill="none" />
          <path d="M18 6 C14 10 15 15 18 17 C21 15 22 10 18 6 Z" fill="#16A34A" />
          <circle cx="6" cy="5.5" r="4" fill="#F97316" />
          <circle cx="6" cy="5.5" r="1.8" fill="#FBBF24" />
          <circle cx="30" cy="5.5" r="4" fill="#FACC15" />
          <circle cx="30" cy="5.5" r="1.8" fill="#F97316" />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill="url(#ps-toran)" />
    </svg>
  );
}

/** Faint mandala for banner backgrounds. */
export function Mandala({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="0.8">
      <circle cx="50" cy="50" r="46" />
      <circle cx="50" cy="50" r="34" />
      <circle cx="50" cy="50" r="12" />
      {Array.from({ length: 16 }, (_, i) => (
        <ellipse key={i} cx="50" cy="22" rx="5" ry="12" transform={`rotate(${i * 22.5} 50 50)`} />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={`p${i}`} d="M50 4 L54 12 L50 16 L46 12 Z" transform={`rotate(${i * 45} 50 50)`} />
      ))}
    </svg>
  );
}
