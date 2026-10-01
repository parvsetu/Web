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
import { fmtRange, getPublicFestival, siteUrl } from '@/lib/public-festival';

type Props = { params: { eventId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = await getPublicFestival(params.eventId);
  if (!f) return { title: 'Festival not found · Parvsetu' };
  const place = [f.city, f.state].filter(Boolean).join(', ');
  const description = `${f.organization.name}${place ? ` · ${place}` : ''} · ${fmtRange(f.startDate, f.endDate)}${f.publicBookingEnabled ? ' · Book entry passes online' : ''}`;
  return {
    metadataBase: new URL(siteUrl()),
    title: `${f.name} · ${f.organization.name}`,
    description,
    openGraph: { title: f.name, description, type: 'website', url: `/f/${f.id}`, siteName: 'Parvsetu' },
    twitter: { card: 'summary_large_image', title: f.name, description },
  };
}

export default async function FestivalPage({ params }: Props) {
  const f = await getPublicFestival(params.eventId);
  if (!f) notFound();
  const t = festivalTheme(f.festivalType);
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
          subtitle={f.organization.name}
          meta={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1">
              <CalendarDays aria-hidden className="h-4 w-4" /> {fmtRange(f.startDate, f.endDate)}
            </span>
          }
        />

        {place && (
          <p className="flex items-start gap-2 px-1 text-slate-700">
            <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: t.ink }} /> {place}
          </p>
        )}
        {f.description && <p className="whitespace-pre-line px-1 text-slate-700">{f.description}</p>}
        <VenueCard venue={f.venue} accent={t.ink} />

        {f.status === 'ACTIVE' && f.publicBookingEnabled && (
          <Link
            href={`/book/${f.id}`}
            className="flex min-h-[64px] items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-xl font-extrabold text-white shadow-lg shadow-orange-500/30"
          >
            <Ticket aria-hidden className="h-7 w-7" /> {allFree ? 'Book free entry pass' : prices.includes(0) ? 'Book passes · free & paid' : `Book passes · from ₹${minPaid}`}
          </Link>
        )}

        {f.timings.length > 0 && (
          <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Clock aria-hidden className="h-5 w-5 text-orange-500" /> Darshan / entry timings</h2>
            <ul className="divide-y divide-orange-50">
              {f.timings.map((s) => (
                <li key={s.label} className="flex justify-between py-2 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-slate-600">
                    {s.startTime}–{s.endTime}
                    {f.publicBookingEnabled ? ` · ${Number(s.price) > 0 ? `₹${Number(s.price)}` : 'Free'}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SponsorStrip sponsors={f.sponsors} title="Festival partners" />

        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-bold">Share with family &amp; friends</h2>
          <ShareButtons url={url} text={`🙏 ${f.name} — ${f.organization.name}, ${fmtRange(f.startDate, f.endDate)}`} posterUrl={`/f/${f.id}/poster`} posterName={f.name.replace(/[^\w-]+/g, '-')} />
        </section>

        {f.volunteerRegistrationOpen && (
          <Link href="/register" className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 font-semibold text-orange-800">
            <HandHeart aria-hidden className="h-5 w-5" /> Volunteer with {f.organization.name}
          </Link>
        )}
      </div>
    </PublicShell>
  );
}
