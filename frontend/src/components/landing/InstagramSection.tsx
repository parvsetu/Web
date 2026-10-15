'use client';

import { Instagram } from 'lucide-react';
import { apiImageSrc } from '@/lib/media';
import { useT } from '@/lib/i18n/provider';
import type { LandingInstagram } from '@/lib/landing';
import { cx } from '../ui';

/** Landing page: photos the mandal approved from its own Instagram, each linking to its post. */
export function InstagramSection({ ig, grid, accent }: { ig: LandingInstagram; grid: boolean; accent: string }) {
  const { t } = useT();
  if (!ig.photos.length) return null;
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Instagram aria-hidden className="h-5 w-5" style={{ color: accent }} /> {t('landing.instagram')}</h2>
        {ig.profileUrl && ig.username && (
          <a href={ig.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white" style={{ background: accent }}>
            <Instagram aria-hidden className="h-4 w-4" /> {t('landing.followOn', { handle: `@${ig.username}` })}
          </a>
        )}
      </div>
      <div className={cx(grid ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' : '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>
        {ig.photos.map((p) => {
          const img = (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={apiImageSrc(p.url)!} alt={p.caption?.slice(0, 120) ?? ''} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" />
          );
          const box = cx('group relative block shrink-0 snap-start overflow-hidden rounded-xl bg-orange-50', grid ? 'aspect-square' : 'h-36 w-36 sm:h-44 sm:w-44');
          return p.permalink ? (
            <a key={p.id} href={p.permalink} target="_blank" rel="noopener noreferrer" className={box} aria-label={t('landing.instagramPost')}>{img}</a>
          ) : (
            <div key={p.id} className={box}>{img}</div>
          );
        })}
      </div>
    </section>
  );
}
