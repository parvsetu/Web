'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { apiImageSrc } from '@/lib/media';
import type { PublicPhoto } from '@/lib/gallery-types';
import { cx } from '@/lib/cx';
import { Lightbox } from './PhotoGrid';

/** Public photos as a swipeable strip (or a grid) with a full-screen viewer. Plain <img>, no login. */
export function PublicGallery({ photos, title = 'Photo gallery', grid, accent }: { photos: PublicPhoto[]; title?: string; grid?: boolean; accent?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!photos.length) return null;
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 font-bold">
        <Camera aria-hidden className="h-5 w-5" style={{ color: accent ?? '#f97316' }} /> {title}
      </h2>
      <div className={cx(grid ? 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4' : '-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden')}>
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className={cx('relative shrink-0 snap-start overflow-hidden rounded-xl bg-orange-50', grid ? 'aspect-square' : 'h-36 w-48 sm:h-44 sm:w-60')}
            aria-label={p.caption ? `Open photo: ${p.caption}` : `Open photo ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiImageSrc(p.thumbUrl)!} alt={p.caption ?? ''} loading="lazy" className="h-full w-full object-cover" />
            {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-left text-xs text-white">{p.caption}</span>}
          </button>
        ))}
      </div>
      {open !== null && photos[open] && (
        <Lightbox
          count={photos.length}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          caption={photos[open].caption}
          // eslint-disable-next-line @next/next/no-img-element
          image={<img src={apiImageSrc(photos[open].url)!} alt={photos[open].caption ?? 'Festival photo'} className="max-h-[80vh] max-w-full object-contain" />}
        />
      )}
    </section>
  );
}
