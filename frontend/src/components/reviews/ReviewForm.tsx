'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, Clock3, MessageSquareHeart, Pencil, Send, X } from 'lucide-react';
import { booking, sendReview } from '@/lib/booking';
import { IMAGE_TYPES, resizeImage } from '@/lib/images';
import { apiImageSrc } from '@/lib/media';
import { useBookingErrorText } from '@/lib/i18n/errors';
import { fmtDateL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { cx } from '@/lib/cx';
import type { OrderReviewState, OwnReview, ReviewStatus } from '@/lib/review-types';
import { Alert, Button, Field, Input, Textarea } from '../ui';
import { StarInput, Stars } from './Stars';

const STATUS_TONE: Record<ReviewStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-slate-200 text-slate-700',
  HIDDEN: 'bg-slate-200 text-slate-700',
};

/**
 * "Share your experience" on a paid pass page. Proof of booking is the order id
 * + access key already in the pass URL; the server decides whether reviews are
 * open. Nothing appears publicly until the mandal approves it.
 */
export function ReviewPanel({ orderId, k }: { orderId: string; k: string }) {
  const { t, locale } = useT();
  const [state, setState] = useState<OrderReviewState | null>(null);
  const [editing, setEditing] = useState(false);
  const [thanks, setThanks] = useState<OwnReview | null>(null);

  useEffect(() => {
    let alive = true;
    booking.orderReview(orderId, k).then((s) => alive && setState(s)).catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [orderId, k]);

  if (!state) return null;
  const own = state.review;

  if (own && !editing) {
    return (
      <section className="no-print flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-bold"><MessageSquareHeart aria-hidden className="h-5 w-5 text-orange-500" /> {t('review.yours')}</h2>
          <span className={cx('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_TONE[own.status])}>{t(`review.status.${own.status}`)}</span>
        </div>
        {thanks && <Alert kind="success">{t('review.thanks')}</Alert>}
        {thanks?.photosRejected && <Alert kind="warning">{t('review.photosRejected', { reason: thanks.photosRejected.message })}</Alert>}
        <div className="flex items-center gap-2">
          <Stars value={own.rating} />
          <span className="text-sm font-semibold text-slate-700">{own.displayName}</span>
        </div>
        {own.text && <p className="whitespace-pre-line text-sm text-slate-700">{own.text}</p>}
        {own.photos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {own.photos.map((p) => (
              <span key={p.id} className="relative h-20 w-20 overflow-hidden rounded-xl bg-orange-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apiImageSrc(p.thumbUrl)!} alt="" className="h-full w-full object-cover" />
                {own.status === 'APPROVED' && !p.approved && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-center text-[10px] text-white">{t('review.photoPending')}</span>
                )}
              </span>
            ))}
          </div>
        )}
        {own.status === 'PENDING' && <p className="text-sm text-slate-500">{t('review.pendingHint')}</p>}
        {own.moderationNote && <p className="text-sm text-slate-600">{t('review.rejectedNote', { note: own.moderationNote })}</p>}
        {own.editable && (
          <Button variant="secondary" size="sm" className="w-fit" onClick={() => { setThanks(null); setEditing(true); }}>
            <Pencil aria-hidden className="h-4 w-4" /> {t('review.edit')}
          </Button>
        )}
      </section>
    );
  }

  if (!own && !state.canSubmit) {
    const note = state.reason === 'NOT_STARTED' ? t('review.notStarted', { date: fmtDateL(state.opensOn, locale) })
      : state.reason === 'WINDOW_CLOSED' ? t('review.windowClosed', { date: fmtDateL(state.closesOn, locale) })
      : null;
    if (!note) return null;
    return (
      <p className="no-print flex items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-200 bg-white p-3 text-center text-sm text-slate-600">
        <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-orange-500" /> {note}
      </p>
    );
  }

  return (
    <ReviewForm
      orderId={orderId}
      k={k}
      state={state}
      existing={own}
      onCancel={own ? () => setEditing(false) : undefined}
      onSaved={(r) => {
        setState({ ...state, canSubmit: false, review: r });
        setThanks(r);
        setEditing(false);
      }}
    />
  );
}

interface NewPhoto {
  file: File;
  preview: string;
}

function ReviewForm({ orderId, k, state, existing, onCancel, onSaved }: {
  orderId: string;
  k: string;
  state: OrderReviewState;
  existing: OwnReview | null;
  onCancel?: () => void;
  onSaved: (r: OwnReview) => void;
}) {
  const { t } = useT();
  const errText = useBookingErrorText();
  const { maxPhotos, maxText, maxDisplayName } = state.limits;
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.text ?? '');
  const [name, setName] = useState(existing?.displayName ?? state.defaultDisplayName);
  const [keep, setKeep] = useState<string[]>(existing?.photos.map((p) => p.id) ?? []);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [consent, setConsent] = useState(!!existing);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Previews are revoked when removed, and the rest when the form goes away.
  const addedRef = useRef(added);
  addedRef.current = added;
  useEffect(() => () => addedRef.current.forEach((a) => URL.revokeObjectURL(a.preview)), []);

  const room = maxPhotos - keep.length - added.length;
  const chars = [...text].length;

  function pick(files: File[]) {
    const ok = files.filter((f) => IMAGE_TYPES.test(f.type)).slice(0, Math.max(0, room));
    setAdded((cur) => [...cur, ...ok.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (picker.current) picker.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rating) return setError(t('review.needRating'));
    if (!consent) return setError(t('review.needConsent'));
    setBusy(true);
    try {
      const form = new FormData();
      form.append('k', k);
      form.append('rating', String(rating));
      if (text.trim()) form.append('text', text.trim());
      form.append('displayName', name.trim());
      form.append('consent', 'true');
      if (existing) form.append('keepPhotoIds', JSON.stringify(keep));
      for (const a of added) {
        // Resized on the phone: ~1600 px under 2 MB, plus a 400 px thumbnail.
        const full = await resizeImage(a.file, { max: 1600, quality: 0.85, maxBytes: 1.9 * 1024 * 1024 });
        const thumb = await resizeImage(full.blob, { max: 400, quality: 0.8, maxBytes: 280 * 1024 });
        form.append('files', full.blob, `photo.${full.blob.type.split('/')[1]}`);
        form.append('thumbs', thumb.blob, `thumb.${thumb.blob.type.split('/')[1]}`);
      }
      setProgress(0);
      const r = await sendReview(orderId, form, existing ? 'PUT' : 'POST', setProgress);
      onSaved(r);
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="no-print flex flex-col gap-4 rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><MessageSquareHeart aria-hidden className="h-5 w-5 text-orange-500" /> {t('review.title')}</h2>
        <p className="text-sm text-slate-600">{t('review.intro', { event: state.event.name })}</p>
      </div>
      <Field label={t('review.rating')}>
        <StarInput value={rating} onChange={setRating} disabled={busy} />
      </Field>
      <Field label={t('review.text')} hint={t('review.chars', { n: chars, max: maxText })}>
        <Textarea rows={4} value={text} maxLength={maxText} placeholder={t('review.textPlaceholder')} onChange={(e) => setText(e.target.value)} disabled={busy} />
      </Field>
      <Field label={t('review.name')} hint={t('review.nameHint')}>
        <Input value={name} maxLength={maxDisplayName} required onChange={(e) => setName(e.target.value)} disabled={busy} />
      </Field>
      <Field label={t('review.photos', { n: maxPhotos })}>
        <div className="flex flex-wrap gap-2">
          {existing?.photos.filter((p) => keep.includes(p.id)).map((p) => (
            <Thumb key={p.id} src={apiImageSrc(p.thumbUrl)!} onRemove={() => setKeep(keep.filter((x) => x !== p.id))} disabled={busy} />
          ))}
          {added.map((a, i) => (
            <Thumb key={a.preview} src={a.preview} onRemove={() => { URL.revokeObjectURL(a.preview); setAdded(added.filter((_, j) => j !== i)); }} disabled={busy} />
          ))}
          {room > 0 && (
            <button type="button" disabled={busy} onClick={() => picker.current?.click()} className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-orange-300 bg-white text-xs font-semibold text-orange-700 hover:bg-orange-50">
              <Camera aria-hidden className="h-6 w-6" /> {t('review.addPhoto')}
            </button>
          )}
        </div>
        <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => pick([...(e.target.files ?? [])])} />
      </Field>
      <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm text-slate-700">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-orange-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} />
        <span>{t('review.consent')}</span>
      </label>
      {error && <Alert>{error}</Alert>}
      {progress !== null && <p className="text-sm text-slate-600" aria-live="polite">{t('review.uploading', { pct: Math.round(progress * 100) })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {existing ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <Send aria-hidden className="h-4 w-4" />} {existing ? t('review.save') : t('review.submit')}
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>{t('review.cancel')}</Button>}
      </div>
    </form>
  );
}

function Thumb({ src, onRemove, disabled }: { src: string; onRemove: () => void; disabled?: boolean }) {
  const { t } = useT();
  return (
    <span className="relative h-20 w-20 overflow-hidden rounded-xl bg-orange-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
      <button type="button" disabled={disabled} onClick={onRemove} aria-label={t('review.removePhoto')} className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}
