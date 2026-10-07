import type { Metadata } from 'next';
import { VenueCard } from '@/components/VenueDetails';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Clock, HandHeart, MapPin, Ticket } from 'lucide-react';
import { FestivalBanner } from '@/components/FestivalBanner';
import { PublicShell } from '@/components/booking/PublicShell';
import { ShareButtons } from '@/components/ShareButtons';
import { SponsorStrip } from '@/components/SponsorStrip';
import { festivalTheme } from '@/lib/festival-theme';
import { getPublicFestival, getPublicPhotos, siteUrl } from '@/lib/public-festival';
import { fmtRangeL } from '@/lib/i18n/format';
import { getServerT } from '@/lib/i18n/server';
import { PublicGallery } from '@/components/gallery/PublicGallery';
import { ReviewsSection } from '@/components/reviews/PublicReviews';

type Props = { params: { eventId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = await getPublicFestival(params.eventId);
  const { t, locale, lang } = await getServerT();
  if (!f) return { title: `${t('festival.notFound')} · Parvsetu` };
  const place = [f.city, f.state].filter(Boolean).join(', ');
  const description = `${f.organization.name}${place ? ` · ${place}` : ''} · ${fmtRangeL(f.startDate, f.endDate, locale)}${f.publicBookingEnabled ? ` · ${t('festival.bookOnline')}` : ''}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: `${f.name} · ${f.organization.name}`,
    description,
    openGraph: { title: f.name, description, type: 'website', url: `/f/${f.id}`, siteName: 'Parvsetu', locale: `${lang}_IN` },
    twitter: { card: 'summary_large_image', title: f.name, description },
  };
}

export default async function FestivalPage({ params }: Props) {
  const f = await getPublicFestival(params.eventId);
  if (!f) notFound();
  const photos = await getPublicPhotos(f.id);
  const th = festivalTheme(f.festivalType);
  const { t, locale } = await getServerT();
  const range = fmtRangeL(f.startDate, f.endDate, locale);
  const url = `${siteUrl()}/f/${f.id}`;
  const place = [f.location, f.city, f.state].filter(Boolean).join(', ');
  const prices = f.timings.map((t) => Number(t.price));
  const allFree = prices.every((p) => p === 0);
  const minPaid = Math.min(...prices.filter((p) => p > 0));

  return (
    <PublicShell>
      <div className="flex flex-col gap-5">
        <FestivalBanner
          type={f.festivalType}
          title={f.name}
          subtitle={
            f.organization.landingSlug ? (
              <Link href={`/m/${f.organization.landingSlug}`} className="underline decoration-white/50 underline-offset-2 hover:decoration-white">{f.organization.name}</Link>
            ) : (
              f.organization.name
            )
          }
          logoUrl={f.organization.logoUrl}
          bannerUrl={f.organization.bannerUrl}
          meta={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1">
              <CalendarDays aria-hidden className="h-4 w-4" /> {range}
            </span>
          }
        />

        {place && (
          <p className="flex items-start gap-2 px-1 text-slate-700">
            <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: th.ink }} /> {place}
          </p>
        )}
        {f.description && <p className="whitespace-pre-line px-1 text-slate-700">{f.description}</p>}
        <VenueCard venue={f.venue} accent={th.ink} />

        {f.status === 'ACTIVE' && f.publicBookingEnabled && (
          <Link
            href={`/book/${f.id}`}
            className="flex min-h-[64px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-xl font-extrabold text-white shadow-lg shadow-orange-500/30"
          >
            <Ticket aria-hidden className="h-7 w-7" /> {allFree ? t('festival.bookFree') : prices.includes(0) ? t('festival.bookFreePaid') : t('festival.bookFrom', { price: minPaid })}
          </Link>
        )}

        {f.timings.length > 0 && (
          <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Clock aria-hidden className="h-5 w-5 text-orange-500" /> {t('festival.timings')}</h2>
            <ul className="divide-y divide-orange-50">
              {f.timings.map((s) => (
                <li key={s.label} className="flex justify-between py-2 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-slate-600">
                    {s.startTime}–{s.endTime}
                    {f.publicBookingEnabled ? ` · ${Number(s.price) > 0 ? `₹${Number(s.price)}` : t('common.free')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PublicGallery photos={photos} accent={th.ink} />

        <ReviewsSection source={{ eventId: f.id }} accent={th.ink} />

        <SponsorStrip sponsors={f.sponsors} title={t('pass.festivalPartners')} />

        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">{t('festival.share')}</h2>
          <ShareButtons url={url} text={`🙏 ${f.name} — ${f.organization.name}, ${range}`} posterUrl={`/f/${f.id}/poster`} posterName={f.name.replace(/[^\w-]+/g, '-')} />
        </section>

        {f.volunteerRegistrationOpen && (
          <Link href="/register" className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 font-semibold text-orange-800">
            <HandHeart aria-hidden className="h-5 w-5 shrink-0" /> {t('festival.volunteer', { org: f.organization.name })}
          </Link>
        )}
      </div>
    </PublicShell>
  );
}
