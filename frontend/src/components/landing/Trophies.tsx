'use client';

import { useState } from 'react';
import { Award, BadgeCheck, Crown, Medal, Ribbon, Star, Trophy, type LucideIcon } from 'lucide-react';
import { apiImageSrc } from '@/lib/media';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/provider';
import type { AchievementIcon, PublicAchievement } from '@/lib/review-types';
import { Lightbox } from '../gallery/PhotoGrid';

export const ACHIEVEMENT_ICON: Record<AchievementIcon, LucideIcon> = {
  TROPHY: Trophy,
  MEDAL: Medal,
  STAR: Star,
  RIBBON: Ribbon,
  CERTIFICATE: BadgeCheck,
  CROWN: Crown,
};

/** "Trophies & recognition" — SHELF = one swipeable row, GRID = wrapped cards. */
export function Trophies({ items, variant = 'SHELF', ink, soft }: { items: PublicAchievement[]; variant?: string; ink: string; soft: string }) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  const withImage = items.filter((a) => a.imageUrl);
  const shelf = variant !== 'GRID';
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Award aria-hidden className="h-5 w-5" style={{ color: ink }} /> {t('landing.trophies')}
      </h2>
      <div className={cx(shelf ? '-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]' : 'grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3')}>
        {items.map((a) => {
          const Icon = ACHIEVEMENT_ICON[a.icon] ?? Trophy;
          const img = apiImageSrc(a.thumbUrl ?? a.imageUrl);
          return (
            <article key={a.id} className={cx('flex flex-col overflow-hidden rounded-2xl border border-orange-100', shelf && 'w-64 shrink-0 snap-start')} style={{ background: soft }}>
              {img ? (
                <button type="button" onClick={() => setOpen(withImage.findIndex((x) => x.id === a.id))} className="aspect-[4/3] w-full bg-white" aria-label={t('gallery.openCaption', { caption: a.title })}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt={a.title} loading="lazy" className="h-full w-full object-cover" />
                </button>
              ) : (
                <span className={cx('flex w-full items-center justify-center', shelf ? 'aspect-[4/3]' : 'aspect-[2/1]')}>
                  <Icon aria-hidden className={shelf ? 'h-16 w-16' : 'h-10 w-10'} style={{ color: ink }} />
                </span>
              )}
              <div className={cx('flex flex-1 flex-col gap-1', shelf ? 'p-3' : 'p-2.5 sm:p-3')}>
                <p className="flex items-start gap-1.5 font-bold leading-snug text-slate-900">
                  {img && <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" style={{ color: ink }} />}
                  <span>{a.title}</span>
                </p>
                {(a.year || a.awardedBy) && (
                  <p className="text-xs font-semibold" style={{ color: ink }}>
                    {[a.year, a.awardedBy && t('landing.awardedBy', { by: a.awardedBy })].filter(Boolean).join(' · ')}
                  </p>
                )}
                {a.description && <p className={cx('text-sm text-slate-600', shelf ? 'line-clamp-4' : 'line-clamp-3')}>{a.description}</p>}
              </div>
            </article>
          );
        })}
      </div>
      {open !== null && open >= 0 && withImage[open] && (
        <Lightbox
          count={withImage.length}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          caption={withImage[open].title}
          // eslint-disable-next-line @next/next/no-img-element
          image={<img src={apiImageSrc(withImage[open].imageUrl)!} alt={withImage[open].title} className="max-h-[80vh] max-w-full object-contain" />}
        />
      )}
    </section>
  );
}
