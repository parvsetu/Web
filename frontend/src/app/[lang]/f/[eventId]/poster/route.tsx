import { ImageResponse } from 'next/og';
import { getPublicFestival } from '@/lib/public-festival';
import { PromoCard } from '../card';

export const runtime = 'nodejs';

/** 1080×1080 poster for Instagram / WhatsApp status. `?download=1` saves it. */
export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  const f = await getPublicFestival(params.eventId);
  if (!f) return new Response('Not found', { status: 404 });
  const img = new ImageResponse(<PromoCard f={f} square />, { width: 1080, height: 1080 });
  const headers = new Headers(img.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  if (new URL(req.url).searchParams.get('download')) {
    headers.set('Content-Disposition', `attachment; filename="${f.name.replace(/[^\w-]+/g, '-')}-poster.png"`);
  }
  return new Response(img.body, { headers });
}
