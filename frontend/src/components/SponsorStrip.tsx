'use client';

import { ExternalLink, Handshake } from 'lucide-react';
import { API_URL } from '@/lib/api';
import { cx } from './ui';
import type { MessageKey } from '@/lib/i18n/core';
import { useT } from '@/lib/i18n/provider';

export interface SponsorPublic {
  id: string;
  name: string;
  tier: 'TITLE' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'PARTNER';
  tagline: string | null;
  bannerText: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
}

const TIER_STYLE: Record<SponsorPublic['tier'], { label: string; cls: string }> = {
  TITLE: { label: 'Title partner', cls: 'from-amber-300 via-yellow-200 to-amber-400 text-amber-950' },
  PLATINUM: { label: 'Platinum partner', cls: 'from-slate-200 via-white to-slate-300 text-slate-800' },
  GOLD: { label: 'Gold partner', cls: 'from-yellow-200 to-amber-300 text-amber-900' },
  SILVER: { label: 'Silver partner', cls: 'from-gray-100 to-gray-300 text-gray-800' },
  PARTNER: { label: 'Partner', cls: 'from-orange-50 to-rose-50 text-orange-900' },
};

export const sponsorLogoSrc = (s: SponsorPublic) => (s.logoUrl ? `${API_URL}${s.logoUrl}` : null);

function Logo({ s, className }: { s: SponsorPublic; className?: string }) {
  const src = sponsorLogoSrc(s);
  const { t } = useT();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={t('common.logo', { name: s.name })} className={cx('object-contain', className)} loading="lazy" />
  ) : (
    <span className={cx('flex items-center justify-center rounded-xl bg-white/70 text-lg font-black text-orange-700', className)}>{s.name.slice(0, 2).toUpperCase()}</span>
  );
}

function Wrap({ s, children, className }: { s: SponsorPublic; children: React.ReactNode; className?: string }) {
  return s.websiteUrl ? (
    <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer sponsored" className={className}>
      {children}
    </a>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** A platform promotional partner (brand) printed on a pass — paid by the brand, not the mandal. */
export interface PartnerPublic {
  id: string;
  partnerId: string;
  name: string;
  message: string;
  tagline: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
}

/**
 * What is printed on a pass: the mandal's own sponsors and the platform's
 * promotional partners, as a compact logo + line row. Print-friendly: plain
 * text and logos only (thermal print hides decorative svgs).
 */
export function PassSponsors({ sponsors, partners }: { sponsors?: SponsorPublic[] | null; partners?: PartnerPublic[] | null }) {
  const items = [
    ...(sponsors ?? []).map((s) => ({ key: s.id, name: s.name, line: s.tagline ?? s.bannerText, logo: sponsorLogoSrc(s) })),
    ...(partners ?? []).map((p) => ({ key: `p-${p.id}`, name: p.name, line: p.message || p.tagline, logo: p.logoUrl ? `${API_URL}${p.logoUrl}` : null })),
  ];
  const { t } = useT();
  if (items.length === 0) return null;
  return (
    <div className="w-full border-t border-dashed border-slate-300 pt-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('sponsor.inAssociation')}</p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
        {items.map((s) => (
          <div key={s.key} className="flex max-w-[220px] items-center gap-2 text-left">
            {s.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo} alt={t('common.logo', { name: s.name })} className="h-9 w-9 shrink-0 rounded-lg object-contain" loading="lazy" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/70 text-sm font-black text-orange-700">{s.name.slice(0, 2).toUpperCase()}</span>
            )}
            <div className="min-w-0">
              <div className="truncate text-xs font-bold text-slate-800">{s.name}</div>
              {s.line && <div className="line-clamp-2 text-[10px] leading-tight text-slate-500">{s.line}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Partners' banners: the top-tier sponsors as full ad cards, the rest as a
 * logo row. Renders nothing when there are no sponsors.
 */
export function SponsorStrip({ sponsors, title: titleProp, compact }: { sponsors: SponsorPublic[] | null | undefined; title?: string; compact?: boolean }) {
  const { t } = useT();
  const title = titleProp ?? t('sponsor.ourPartners');
  if (!sponsors || sponsors.length === 0) return null;
  const featured = sponsors.filter((s) => s.tier === 'TITLE' || s.tier === 'PLATINUM' || (s.tier === 'GOLD' && !!s.bannerText));
  const rest = sponsors.filter((s) => !featured.includes(s));
  const shownFeatured = compact ? featured.slice(0, 1) : featured;
  return (
    <section aria-label={title} className="no-print flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
        <Handshake aria-hidden className="h-4 w-4 text-orange-500" /> {title}
      </h2>
      {shownFeatured.map((s) => (
        <Wrap key={s.id} s={s} className={cx('group flex items-center gap-3 rounded-2xl bg-gradient-to-r p-3 shadow-sm ring-1 ring-black/5', TIER_STYLE[s.tier].cls)}>
          <Logo s={s} className="h-14 w-14 shrink-0 rounded-xl bg-white p-1" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">{t(`sponsor.${s.tier}` as MessageKey)}</div>
            <div className="truncate text-base font-extrabold">{s.name}</div>
            {(s.bannerText || s.tagline) && <div className="line-clamp-2 text-sm opacity-90">{s.bannerText ?? s.tagline}</div>}
          </div>
          {s.websiteUrl && <ExternalLink aria-hidden className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100" />}
        </Wrap>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(compact ? rest.slice(0, 6) : rest).map((s) => (
            <Wrap key={s.id} s={s} className="flex items-center gap-2 rounded-xl bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-orange-100 hover:ring-orange-300">
              <Logo s={s} className="h-8 w-8 rounded-lg" />
              <span className="text-sm font-semibold text-slate-700">{s.name}</span>
            </Wrap>
          ))}
        </div>
      )}
    </section>
  );
}
