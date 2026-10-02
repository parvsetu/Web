'use client';

import type { ReactNode } from 'react';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { FestivalArt, Mandala, Toran } from './FestivalArt';
import { cx } from '@/lib/cx';
import { apiImageSrc } from '@/lib/media';
import { useT } from '@/lib/i18n/provider';

/** Gradient hero with the festival's illustration, a toran and a faint mandala. */
export function FestivalBanner({
  type,
  title,
  subtitle,
  meta,
  compact,
  children,
  logoUrl,
  bannerUrl,
}: {
  type?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  compact?: boolean;
  children?: ReactNode;
  /** Mandal logo (API path) — shown next to the subtitle (the mandal name). */
  logoUrl?: string | null;
  /** Mandal banner (API path) — used as the hero background, festival gradient as fallback. */
  bannerUrl?: string | null;
}) {
  const t = festivalTheme(type);
  const banner = apiImageSrc(bannerUrl);
  const logo = apiImageSrc(logoUrl);
  const { festivalType } = useT();
  return (
    <section className="relative overflow-hidden rounded-3xl text-white shadow-lg" style={{ background: gradient(t) }}>
      {banner && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
        </>
      )}
      <Toran className="absolute inset-x-0 top-0 w-full" />
      <Mandala className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 text-white/15" />
      <div className={cx('relative flex items-center gap-3', compact ? 'px-4 pb-4 pt-7' : 'px-5 pb-5 pt-8')}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">{type ? festivalType(type) : t.label}</p>
          <h1 className={cx('font-extrabold leading-tight drop-shadow-sm', compact ? 'text-xl' : 'text-2xl')}>{title}</h1>
          {subtitle && (
            <p className="mt-1 flex items-center gap-2 text-sm text-white/90">
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className={cx('shrink-0 rounded-full bg-white object-contain p-0.5 ring-2 ring-white/60', compact ? 'h-7 w-7' : 'h-9 w-9')} />
              )}
              <span className="min-w-0">{subtitle}</span>
            </p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">{meta}</div>}
        </div>
        <div className={cx('shrink-0 rounded-full bg-white/95 p-2 shadow-md ring-4 ring-white/30', compact ? 'h-16 w-16' : 'h-24 w-24')}>
          <FestivalArt type={type} className="h-full w-full" />
        </div>
      </div>
      {children && <div className="relative px-5 pb-5">{children}</div>}
    </section>
  );
}

/** Small round festival badge for lists and cards. */
export function FestivalBadge({ type, className }: { type?: string | null; className?: string }) {
  const t = festivalTheme(type);
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-2xl p-1.5', className)} style={{ background: t.soft }}>
      <FestivalArt type={type} className="h-full w-full" />
    </span>
  );
}
