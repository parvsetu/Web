'use client';

import { Star } from 'lucide-react';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/provider';

/** Read-only 1–5 stars (rounded to the nearest half for averages). */
export function Stars({ value, className }: { value: number; className?: string }) {
  const { t } = useT();
  const v = Math.round(value * 2) / 2;
  return (
    <span className={cx('inline-flex items-center gap-0.5', className)} role="img" aria-label={t('reviews.ratingLabel', { n: String(value) })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="relative inline-block h-4 w-4">
          <Star aria-hidden className="absolute inset-0 h-4 w-4 text-amber-300" />
          {v >= i - 0.5 && (
            <span className="absolute inset-0 overflow-hidden" style={{ width: v >= i ? '100%' : '50%' }}>
              <Star aria-hidden className="h-4 w-4 fill-amber-400 text-amber-400" />
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

/** Large tappable star picker (radio group). */
export function StarInput({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const { t, tp } = useT();
  return (
    <div role="radiogroup" aria-label={t('review.rating')} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={tp('review.star', n)}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-amber-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-300"
        >
          <Star aria-hidden className={cx('h-9 w-9', n <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
        </button>
      ))}
    </div>
  );
}
