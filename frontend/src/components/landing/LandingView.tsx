import Link from 'next/link';
import { CalendarDays, CheckCircle2, Facebook, History, Instagram, Mail, MapPin, MessageCircle, Phone, Sparkles, Ticket, Youtube } from 'lucide-react';
import { FestivalArt, Mandala, Toran } from '../FestivalArt';
import { ShareButtons } from '../ShareButtons';
import { SponsorStrip } from '../SponsorStrip';
import { PublicGallery } from '../gallery/PublicGallery';
import { apiImageSrc } from '@/lib/media';
import { fmtRange } from '@/lib/public-festival';
import { landingTheme, type LandingEventCard, type LandingPublic } from '@/lib/landing';

const price = (p: string | null) => (p === null ? null : Number(p) === 0 ? 'Free entry' : `From ₹${Number(p).toLocaleString('en-IN')}`);

/** The mandal's public landing page. Presentational: rendered by the server page and by the editor preview. */
export function LandingView({ p, url }: { p: LandingPublic; url: string }) {
  const t = landingTheme(p.theme);
  const banner = apiImageSrc(p.organization.bannerUrl);
  const logo = apiImageSrc(p.organization.logoUrl);
  const place = [p.organization.city, p.organization.state].filter(Boolean).join(', ');
  const socials = [
    p.social.instagram && { href: p.social.instagram, label: 'Instagram', icon: Instagram },
    p.social.facebook && { href: p.social.facebook, label: 'Facebook', icon: Facebook },
    p.social.youtube && { href: p.social.youtube, label: 'YouTube', icon: Youtube },
    p.social.whatsapp && { href: p.social.whatsapp, label: 'WhatsApp', icon: MessageCircle },
  ].filter(Boolean) as { href: string; label: string; icon: typeof Instagram }[];

  return (
    <div className="flex flex-col gap-5">
      <section className="relative overflow-hidden rounded-3xl text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.via} 55%, ${t.to})` }}>
        {banner && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
          </>
        )}
        <Toran className="absolute inset-x-0 top-0 w-full" />
        {!banner && <Mandala className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 text-white/15" />}
        <div className="relative flex min-h-[260px] flex-col justify-end gap-3 px-5 pb-6 pt-14 sm:min-h-[340px] sm:px-8">
          <div className="flex items-end gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-white p-1.5 shadow-lg ring-4 ring-white/40 sm:h-28 sm:w-28">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={`${p.organization.name} logo`} className="h-full w-full object-contain" />
              ) : (
                <FestivalArt type="DEFAULT" className="h-full w-full" />
              )}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold leading-tight drop-shadow sm:text-4xl">{p.organization.name}</h1>
              {place && (
                <p className="mt-1 flex items-center gap-1 text-sm text-white/90">
                  <MapPin aria-hidden className="h-4 w-4" /> {place}
                </p>
              )}
            </div>
          </div>
          {p.headline && <p className="max-w-2xl text-lg font-semibold drop-shadow sm:text-xl">{p.headline}</p>}
        </div>
      </section>

      {p.about && (
        <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-bold" style={{ color: t.ink }}>About us</h2>
          <p className="whitespace-pre-line text-slate-700">{p.about}</p>
        </section>
      )}

      {p.highlights.length > 0 && (
        <section className="grid gap-2 sm:grid-cols-2">
          {p.highlights.map((h) => (
            <div key={h} className="flex items-start gap-2 rounded-2xl p-3 font-semibold" style={{ background: t.soft, color: t.ink }}>
              <Sparkles aria-hidden className="mt-0.5 h-5 w-5 shrink-0" /> {h}
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-extrabold text-slate-900">
          <CalendarDays aria-hidden className="h-5 w-5" style={{ color: t.ink }} /> Upcoming &amp; ongoing
        </h2>
        {p.upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-orange-200 bg-white p-4 text-sm text-slate-600">No festivals open right now — follow us for the next one.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {p.upcoming.map((e) => <EventCard key={e.id} e={e} ink={t.ink} />)}
          </div>
        )}
      </section>

      <PublicGallery photos={p.photos} title="Moments from our festivals" grid accent={t.ink} />

      {p.past.length > 0 && (
        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><History aria-hidden className="h-5 w-5" style={{ color: t.ink }} /> Past festivals</h2>
          <div className="flex flex-col gap-3">
            {p.past.map((y) => (
              <div key={y.year}>
                <p className="mb-1 text-sm font-extrabold" style={{ color: t.ink }}>{y.year}</p>
                <ul className="flex flex-col divide-y divide-orange-50">
                  {y.events.map((e) => (
                    <li key={e.id}>
                      <Link href={`/f/${e.id}`} className="flex min-h-[44px] items-center justify-between gap-2 py-1.5 text-sm hover:underline">
                        <span className="font-semibold">{e.name}</span>
                        <span className="shrink-0 text-slate-500">{fmtRange(e.startDate, e.endDate)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <SponsorStrip sponsors={p.sponsors} title="Our partners" />

      {(p.contact.phone || p.contact.email || socials.length > 0) && (
        <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-bold">Contact us</h2>
          <div className="flex flex-wrap gap-2">
            {p.contact.phone && (
              <a href={`tel:${p.contact.phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-4 font-semibold text-white" style={{ background: t.via }}>
                <Phone aria-hidden className="h-4 w-4" /> {p.contact.phone}
              </a>
            )}
            {p.contact.email && (
              <a href={`mailto:${p.contact.email}`} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 font-semibold">
                <Mail aria-hidden className="h-4 w-4" /> {p.contact.email}
              </a>
            )}
            {socials.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 font-semibold">
                <s.icon aria-hidden className="h-4 w-4" style={{ color: t.ink }} /> {s.label}
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold">Share this page</h2>
        <ShareButtons url={url} text={`🙏 ${p.organization.name}${p.headline ? ` — ${p.headline}` : ''}`} />
      </section>
    </div>
  );
}

function EventCard({ e, ink }: { e: LandingEventCard; ink: string }) {
  const pr = price(e.fromPrice);
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="h-12 w-12 shrink-0 rounded-2xl bg-orange-50 p-1.5"><FestivalArt type={e.festivalType} className="h-full w-full" /></span>
        <div className="min-w-0">
          <h3 className="font-bold leading-snug">{e.name}</h3>
          <p className="text-xs text-slate-500">{fmtRange(e.startDate, e.endDate)}{e.location ? ` · ${e.location}` : ''}</p>
        </div>
      </div>
      {e.description && <p className="line-clamp-2 text-sm text-slate-600">{e.description}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        {e.bookable && (
          <Link href={`/book/${e.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-white" style={{ background: ink }}>
            <Ticket aria-hidden className="h-4 w-4" /> Book passes{pr ? ` · ${pr}` : ''}
          </Link>
        )}
        <Link href={`/f/${e.id}`} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-200 px-3 text-sm font-semibold">
          <CheckCircle2 aria-hidden className="h-4 w-4" /> Details
        </Link>
      </div>
    </article>
  );
}
