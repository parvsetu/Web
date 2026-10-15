import { ImageResponse } from 'next/og';
import { getLandingPage, landingTheme } from '@/lib/landing';
import { apiImageSrc } from '@/lib/media';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Mandal on Parvsetu';

/** Social preview: the mandal's banner (or its theme gradient) with logo, name and headline. */
export default async function Image({ params }: { params: { slug: string } }) {
  const p = await getLandingPage(params.slug);
  if (!p) {
    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'white', background: 'linear-gradient(135deg,#f59e0b,#e11d48)' }}>🪔 Parvsetu</div>,
      size,
    );
  }
  const t = landingTheme(p.theme);
  const banner = apiImageSrc(p.organization.bannerUrl);
  const logo = apiImageSrc(p.organization.logoUrl);
  return new ImageResponse(
    <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', color: 'white', fontFamily: 'sans-serif', backgroundImage: `linear-gradient(135deg, ${t.from}, ${t.via} 55%, ${t.to})` }}>
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      {banner ? <img src={banner} width={1200} height={630} style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} /> : null}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', background: banner ? 'linear-gradient(0deg, rgba(0,0,0,0.85), rgba(0,0,0,0.2))' : 'transparent' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 64, gap: 18, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {logo ? (
            <div style={{ display: 'flex', width: 150, height: 150, borderRadius: 32, background: 'white', padding: 10 }}>
              {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
              <img src={logo} width={130} height={130} style={{ objectFit: 'contain' }} />
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05 }}>{p.organization.name}</div>
            {p.organization.city ? <div style={{ fontSize: 30, opacity: 0.9, marginTop: 8 }}>{[p.organization.city, p.organization.state].filter(Boolean).join(', ')}</div> : null}
          </div>
        </div>
        {p.headline ? <div style={{ fontSize: 36, opacity: 0.95 }}>{p.headline}</div> : null}
        <div style={{ fontSize: 24, opacity: 0.8 }}>🪔 Parvsetu</div>
      </div>
    </div>,
    size,
  );
}
