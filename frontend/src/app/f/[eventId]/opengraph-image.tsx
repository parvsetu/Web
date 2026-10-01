import { ImageResponse } from 'next/og';
import { getPublicFestival } from '@/lib/public-festival';
import { PromoCard } from './card';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Festival on Parvsetu';

export default async function Image({ params }: { params: { eventId: string } }) {
  const f = await getPublicFestival(params.eventId);
  if (!f) {
    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: 'white', background: 'linear-gradient(135deg,#f59e0b,#e11d48)' }}>🪔 Parvsetu</div>,
      size,
    );
  }
  return new ImageResponse(<PromoCard f={f} />, size);
}
