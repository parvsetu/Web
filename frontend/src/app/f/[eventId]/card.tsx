import { festivalTheme } from '@/lib/festival-theme';
import { fmtRange, type PublicFestival } from '@/lib/public-festival';
import { readFileSync } from 'fs';
import { join } from 'path';

const KNOWN = ['GANESH_UTSAV', 'DURGA_PUJA', 'NAVRATRI', 'JANMASHTAMI', 'RAM_NAVAMI', 'DUSSEHRA', 'DIWALI', 'CHHATH_PUJA'];
/** The festival illustration (pre-exported to public/art) as a data URL the image renderer can embed. */
function artSrc(type: string) {
  const file = KNOWN.includes(type) ? type : 'DEFAULT';
  const svg = readFileSync(join(process.cwd(), 'public', 'art', `${file}.svg`));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

function priceLine(f: PublicFestival) {
  if (!f.publicBookingEnabled || f.timings.length === 0) return null;
  const prices = f.timings.map((t) => Number(t.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max === 0) return 'Free entry passes';
  if (min === 0) return 'Free & paid passes';
  return `Passes from ₹${min}`;
}

/** Shared JSX for the social preview (1200×630) and the Instagram poster (1080×1080). */
export function PromoCard({ f, square }: { f: PublicFestival; square?: boolean }) {
  const t = festivalTheme(f.festivalType);
  const place = [f.city ?? f.organization.city, f.state ?? f.organization.state].filter(Boolean).join(', ');
  const price = priceLine(f);
  const sponsor = f.sponsors.find((s) => s.tier === 'TITLE' || s.tier === 'PLATINUM') ?? f.sponsors[0];
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: square ? 'column' : 'row', alignItems: 'center',
        justifyContent: 'center', gap: square ? 36 : 56, padding: square ? 72 : 64, color: 'white', fontFamily: 'sans-serif',
        backgroundImage: `linear-gradient(135deg, ${t.from} 0%, ${t.via} 55%, ${t.to} 100%)`,
      }}
    >
      <div style={{ display: 'flex', width: square ? 380 : 360, height: square ? 380 : 360, borderRadius: 999, background: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={artSrc(f.festivalType)} width={square ? 300 : 280} height={square ? 300 : 280} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: square ? 'center' : 'flex-start', textAlign: square ? 'center' : 'left', maxWidth: square ? 900 : 640 }}>
        <div style={{ fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', opacity: 0.9 }}>{t.label === 'Festival' ? f.festivalType.replace(/_/g, ' ') : t.label}</div>
        <div style={{ fontSize: square ? 76 : 68, fontWeight: 800, lineHeight: 1.05, marginTop: 8 }}>{f.name}</div>
        <div style={{ fontSize: 34, marginTop: 14, opacity: 0.95 }}>{f.organization.name}</div>
        <div style={{ fontSize: 30, marginTop: 18, display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: square ? 'center' : 'flex-start' }}>
          <span>{fmtRange(f.startDate, f.endDate)}</span>
          {place ? <span>· {place}</span> : null}
        </div>
        {price ? (
          <div style={{ marginTop: 26, display: 'flex', background: 'white', color: t.ink, fontSize: 32, fontWeight: 800, padding: '14px 30px', borderRadius: 999 }}>{price} · Book online</div>
        ) : null}
        {sponsor ? <div style={{ marginTop: 22, fontSize: 24, opacity: 0.9 }}>In association with {sponsor.name}</div> : null}
        <div style={{ marginTop: 22, fontSize: 22, opacity: 0.8 }}>🪔 Parvsetu</div>
      </div>
    </div>
  );
}
