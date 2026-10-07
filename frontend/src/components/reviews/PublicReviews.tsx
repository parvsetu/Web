'use client';

import { useEffect, useState } from 'react';
import { Award, Camera, Flag, MessageSquareQuote } from 'lucide-react';
import { booking } from '@/lib/booking';
import { useBookingErrorText } from '@/lib/i18n/errors';
import { useT } from '@/lib/i18n/provider';
import { fmtDateL } from '@/lib/i18n/format';
import { apiImageSrc } from '@/lib/media';
import { cx } from '@/lib/cx';
import { REPORT_REASONS, type PublicReview, type PublicReviewPage, type ReportReason, type ReviewPhotoRef, type ReviewSummary, type VisitorPhoto, type VisitorPhotoPage } from '@/lib/review-types';
import { Alert, Button, Field, Modal, Textarea } from '../ui';
import { Lightbox } from '../gallery/PhotoGrid';
import { Stars } from './Stars';

type Source = { slug: string } | { eventId: string };

const fetchPage = (src: Source, page: number) => ('slug' in src ? booking.landingReviews(src.slug, page) : booking.eventReviews(src.eventId, page));

/** "4.6 ★★★★★ · 23 reviews" */
export function ReviewSummaryLine({ summary, className }: { summary: ReviewSummary; className?: string }) {
  const { t, tp } = useT();
  if (!summary.count || summary.average === null) return null;
  return (
    <p className={cx('flex flex-wrap items-center gap-2 text-sm text-slate-600', className)}>
      <span className="text-2xl font-black text-slate-900">{summary.average.toFixed(1)}</span>
      <Stars value={summary.average} />
      <span>{t('reviews.average', { avg: summary.average.toFixed(1) })} · {tp('reviews.count', summary.count)}</span>
    </p>
  );
}

/**
 * Approved visitor reviews, featured first, with "show more" paging. `variant`
 * CARDS = grid, SLIDER = one swipeable row. Renders nothing while there are none.
 */
export function ReviewsSection({ source, initial, variant = 'CARDS', accent, showEvent }: {
  source: Source;
  initial?: Pick<PublicReviewPage, 'items' | 'total' | 'summary'>;
  variant?: string;
  accent?: string;
  showEvent?: boolean;
}) {
  const { t } = useT();
  const errText = useBookingErrorText();
  const [items, setItems] = useState<PublicReview[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [summary, setSummary] = useState<ReviewSummary | null>(initial?.summary ?? null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = 'slug' in source ? source.slug : source.eventId;

  useEffect(() => {
    if (initial) return;
    let alive = true;
    fetchPage(source, 1)
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setTotal(r.total);
        setSummary(r.summary);
      })
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function more() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchPage(source, page + 1);
      setItems((cur) => [...cur, ...r.items.filter((x) => !cur.some((c) => c.id === x.id))]);
      setTotal(r.total);
      setPage(page + 1);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!items.length) return null;
  const slider = variant === 'SLIDER';
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <MessageSquareQuote aria-hidden className="h-5 w-5" style={{ color: accent ?? '#f97316' }} /> {t('reviews.title')}
      </h2>
      {summary && <ReviewSummaryLine summary={summary} className="mb-3" />}
      <div className={cx(slider ? '-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]' : 'grid gap-3 sm:grid-cols-2')}>
        {items.map((r) => (
          <ReviewCard key={r.id} r={r} accent={accent} showEvent={showEvent} className={slider ? 'w-[85%] shrink-0 snap-start sm:w-80' : undefined} />
        ))}
      </div>
      {items.length < total && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void more()}>{t('reviews.more')}</Button>
        </div>
      )}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </section>
  );
}

export function ReviewCard({ r, accent, showEvent, className }: { r: PublicReview; accent?: string; showEvent?: boolean; className?: string }) {
  const { t, locale } = useT();
  const [reporting, setReporting] = useState(false);
  return (
    <article className={cx('flex flex-col gap-2 rounded-2xl border border-orange-100 bg-orange-50/30 p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-900">{r.displayName}</p>
          <p className="text-xs text-slate-500">
            {fmtDateL(r.createdAt.slice(0, 10), locale)}
            {showEvent ? ` · ${r.event.name}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Stars value={r.rating} />
          {r.featured && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: accent ?? '#f97316' }}>
              <Award aria-hidden className="h-3 w-3" /> {t('reviews.featured')}
            </span>
          )}
        </div>
      </div>
      {r.text && <p className="whitespace-pre-line text-sm text-slate-700">{r.text}</p>}
      {r.photos.length > 0 && <PhotoStrip photos={r.photos} name={r.displayName} />}
      <button type="button" onClick={() => setReporting(true)} className="mt-auto inline-flex min-h-[36px] w-fit items-center gap-1 self-end rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-700">
        <Flag aria-hidden className="h-3.5 w-3.5" /> {t('reviews.report')}
      </button>
      {reporting && <ReportDialog reviewId={r.id} onClose={() => setReporting(false)} />}
    </article>
  );
}

function PhotoStrip({ photos, name }: { photos: ReviewPhotoRef[]; name: string }) {
  const { t } = useT();
  const [open, setOpen] = useState<number | null>(null);
  const alt = t('review.photoAlt', { name });
  return (
    <>
      <div className="flex gap-2">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} aria-label={t('gallery.open', { i: i + 1 })} className="h-20 w-20 overflow-hidden rounded-xl bg-orange-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiImageSrc(p.thumbUrl)!} alt={alt} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {open !== null && photos[open] && (
        <Lightbox
          count={photos.length}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          // eslint-disable-next-line @next/next/no-img-element
          image={<img src={apiImageSrc(photos[open].url)!} alt={alt} className="max-h-[80vh] max-w-full object-contain" />}
        />
      )}
    </>
  );
}

function ReportDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const { t } = useT();
  const errText = useBookingErrorText();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await booking.reportReview(reviewId, { reason, note: note.trim() || undefined });
      setDone(true);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={t('reviews.reportTitle')}>
      {done ? (
        <div className="flex flex-col gap-3">
          <Alert kind="success">{t('reviews.reported')}</Alert>
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold text-slate-700">{t('reviews.reportReason')}</legend>
            {REPORT_REASONS.map((r) => (
              <label key={r} className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 hover:bg-orange-50">
                <input type="radio" name="reason" className="h-5 w-5 accent-orange-600" checked={reason === r} onChange={() => setReason(r)} />
                {t(`reviews.reason.${r}`)}
              </label>
            ))}
          </fieldset>
          <Field label={t('reviews.reportNote')}>
            <Textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button disabled={!reason} loading={busy} onClick={() => void send()}>
            <Flag aria-hidden className="h-4 w-4" /> {t('reviews.reportSend')}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Approved visitor photos & selfies (from approved reviews), with "show more". */
export function VisitorPhotosSection({ slug, initial, accent }: { slug: string; initial: Pick<VisitorPhotoPage, 'items' | 'total'>; accent?: string }) {
  const { t } = useT();
  const errText = useBookingErrorText();
  const [items, setItems] = useState<VisitorPhoto[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;

  async function more() {
    setBusy(true);
    setError(null);
    try {
      const r = await booking.visitorPhotos(slug, page + 1);
      setItems((cur) => [...cur, ...r.items.filter((x) => !cur.some((c) => c.id === x.id))]);
      setTotal(r.total);
      setPage(page + 1);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const caption = (p: VisitorPhoto) => t('landing.visitorPhotoBy', { name: p.displayName, event: p.event.name });
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Camera aria-hidden className="h-5 w-5" style={{ color: accent ?? '#f97316' }} /> {t('landing.visitorPhotos')}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} aria-label={caption(p)} className="aspect-square overflow-hidden rounded-xl bg-orange-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiImageSrc(p.thumbUrl)!} alt={t('review.photoAlt', { name: p.displayName })} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {items.length < total && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" loading={busy} onClick={() => void more()}>{t('landing.morePhotos')}</Button>
        </div>
      )}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      {open !== null && items[open] && (
        <Lightbox
          count={items.length}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          caption={caption(items[open])}
          // eslint-disable-next-line @next/next/no-img-element
          image={<img src={apiImageSrc(items[open].url)!} alt={t('review.photoAlt', { name: items[open].displayName })} className="max-h-[80vh] max-w-full object-contain" />}
        />
      )}
    </section>
  );
}
