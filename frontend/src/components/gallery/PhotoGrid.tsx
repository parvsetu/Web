'use client';

import { useT } from '@/lib/i18n/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronLeft, ChevronRight, Globe, ImagePlus, Lock, Pencil, Trash2, Upload, X } from 'lucide-react';
import { api, errorMessage, uploadForm } from '@/lib/api';
import { apiImageSrc, formatMb, IMAGE_TYPES, resizeImage, useAuthedImage } from '@/lib/images';
import type { GalleryUsage, Photo } from '@/lib/gallery-types';
import { cx } from '@/lib/cx';
import { Alert, Button, Empty, Input, Modal } from '../ui';

/** A private photo is fetched with the bearer token; a public one loads as a plain <img>. */
export function PhotoImg({ photo, size, className, alt }: { photo: Photo; size: 'thumb' | 'full'; className?: string; alt?: string }) {
  const pub = size === 'thumb' ? photo.publicThumbUrl : photo.publicUrl;
  const authed = useAuthedImage(pub ? null : size === 'thumb' ? photo.thumbUrl : photo.url);
  const src = pub ? apiImageSrc(pub) : authed;
  if (!src) return <span className={cx('block animate-pulse bg-orange-100', className)} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? photo.caption ?? 'Festival photo'} loading="lazy" className={className} />;
}

export function UsageBar({ usage }: { usage: GalleryUsage | null | undefined }) {
  if (!usage) return null;
  const pct = Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs font-semibold text-slate-600">
        <span>{formatMb(usage.usedBytes)} of {formatMb(usage.quotaBytes)} used</span>
        <span>{usage.photos} photos</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-orange-100">
        <div className={cx('h-full rounded-full', pct > 90 ? 'bg-red-500' : 'bg-gradient-to-r from-amber-400 to-orange-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

interface Queued {
  name: string;
  status: 'resizing' | 'uploading' | 'done' | 'error';
  error?: string;
}

/**
 * Multi-photo upload: drag & drop or the phone's camera/gallery picker.
 * Each photo is resized on the device (max 1920 px, ~0.85) plus a 400 px
 * thumbnail, then sent in batches of 5 with progress.
 */
export function PhotoUploader({ eventId, onUploaded }: { eventId: string; onUploaded: (usage: GalleryUsage) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handle(files: File[]) {
    const list = files.filter((f) => IMAGE_TYPES.test(f.type));
    if (!list.length) return setError('Choose PNG, JPG or WebP photos.');
    setError(null);
    setQueue(list.map((f) => ({ name: f.name, status: 'resizing' })));
    const mark = (i: number, q: Partial<Queued>) => setQueue((cur) => cur.map((x, j) => (j === i ? { ...x, ...q } : x)));
    for (let start = 0; start < list.length; start += 5) {
      const batch = list.slice(start, start + 5);
      const form = new FormData();
      const meta: { takenAt?: string }[] = [];
      const ok: number[] = [];
      for (const [k, f] of batch.entries()) {
        const i = start + k;
        try {
          const full = await resizeImage(f, { max: 1920, quality: 0.85, maxBytes: 2.8 * 1024 * 1024 });
          const thumb = await resizeImage(full.blob, { max: 400, quality: 0.8, maxBytes: 280 * 1024 });
          form.append('files', full.blob, f.name.replace(/\.\w+$/, '') + '.' + full.blob.type.split('/')[1]);
          form.append('thumbs', thumb.blob, 'thumb.' + thumb.blob.type.split('/')[1]);
          meta.push(f.lastModified ? { takenAt: new Date(f.lastModified).toISOString() } : {});
          ok.push(i);
          mark(i, { status: 'uploading' });
        } catch (e) {
          mark(i, { status: 'error', error: errorMessage(e) });
        }
      }
      if (!ok.length) continue;
      form.append('meta', JSON.stringify(meta));
      try {
        setProgress(0);
        const res = await uploadForm<{ usage: GalleryUsage }>(`/events/${eventId}/photos`, form, { onProgress: setProgress });
        ok.forEach((i) => mark(i, { status: 'done' }));
        onUploaded(res.usage);
      } catch (e) {
        ok.forEach((i) => mark(i, { status: 'error', error: errorMessage(e) }));
        setError(errorMessage(e));
      } finally {
        setProgress(null);
      }
    }
    if (input.current) input.current.value = '';
    if (camera.current) camera.current.value = '';
  }

  const busy = queue.some((q) => q.status === 'resizing' || q.status === 'uploading');
  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle([...e.dataTransfer.files]);
        }}
        className={cx('flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-5 text-center transition-colors', drag ? 'border-orange-500 bg-orange-100' : 'border-orange-300 bg-orange-50/60')}
      >
        <ImagePlus aria-hidden className="h-8 w-8 text-orange-500" />
        <p className="text-sm text-slate-700">Drag photos here, or</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => input.current?.click()} loading={busy}>
            <Upload aria-hidden className="h-4 w-4" /> Choose photos
          </Button>
          <Button size="sm" variant="secondary" onClick={() => camera.current?.click()} disabled={busy}>
            <Camera aria-hidden className="h-4 w-4" /> Take photo
          </Button>
        </div>
        <p className="text-xs text-slate-500">Resized on your phone before upload. New photos are private until you make them public.</p>
      </div>
      <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void handle([...(e.target.files ?? [])])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handle([...(e.target.files ?? [])])} />
      {progress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-orange-100" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-orange-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {queue.length > 0 && (
        <p className="text-xs text-slate-600">
          {queue.filter((q) => q.status === 'done').length} of {queue.length} uploaded
          {queue.some((q) => q.status === 'error') ? ` · ${queue.filter((q) => q.status === 'error').length} failed` : ''}
        </p>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

/** Thumbnail grid with a lightbox; manage actions (caption, public toggle, delete) when `canManage`. */
export function PhotoGrid({ photos, canManage, onChanged }: { photos: Photo[]; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(p: Photo) {
    setError(null);
    try {
      await api.patch(`/events/${p.eventId}/photos/${p.id}`, { isPublic: !p.isPublic });
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function remove(p: Photo) {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    setError(null);
    try {
      await api.del(`/events/${p.eventId}/photos/${p.id}`);
      setOpen(null);
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!photos.length) return <Empty title="No photos yet" icon={Camera}>Upload photos of the pandal, aarti and celebrations.</Empty>;
  return (
    <>
      {error && <Alert>{error}</Alert>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <div key={p.id} className="group relative overflow-hidden rounded-xl bg-orange-50 ring-1 ring-orange-100">
            <button type="button" onClick={() => setOpen(i)} className="block aspect-square w-full" aria-label={`Open photo ${p.caption ?? i + 1}`}>
              <PhotoImg photo={p} size="thumb" className="h-full w-full object-cover" />
            </button>
            <span className={cx('absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold', p.isPublic ? 'bg-green-600 text-white' : 'bg-black/60 text-white')}>
              {p.isPublic ? <Globe aria-hidden className="h-3 w-3" /> : <Lock aria-hidden className="h-3 w-3" />} {p.isPublic ? 'Public' : 'Private'}
            </span>
            {p.caption && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-xs text-white">{p.caption}</span>}
            {canManage && (
              <div className="absolute right-1 top-1 flex gap-1">
                <IconBtn label={p.isPublic ? 'Make private' : 'Make public'} onClick={() => void toggle(p)}>{p.isPublic ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}</IconBtn>
                <IconBtn label="Edit caption" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></IconBtn>
                <IconBtn label="Delete" onClick={() => void remove(p)}><Trash2 className="h-4 w-4" /></IconBtn>
              </div>
            )}
          </div>
        ))}
      </div>
      {open !== null && photos[open] && (
        <Lightbox
          count={photos.length}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          caption={photos[open].caption}
          image={<PhotoImg photo={photos[open]} size="full" className="max-h-[80vh] max-w-full object-contain" />}
        />
      )}
      {editing && <CaptionModal photo={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />}
    </>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white">
      {children}
    </button>
  );
}

function CaptionModal({ photo, onClose, onSaved }: { photo: Photo; onClose: () => void; onSaved: () => void }) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/events/${photo.eventId}/photos/${photo.id}`, { caption });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Photo caption">
      <div className="flex flex-col gap-3">
        <PhotoImg photo={photo} size="thumb" className="mx-auto max-h-48 rounded-xl object-contain" />
        <Input value={caption} maxLength={300} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Sandhi puja, Ashtami night" aria-label="Caption" />
        {error && <Alert>{error}</Alert>}
        <Button onClick={() => void save()} loading={busy}>Save caption</Button>
      </div>
    </Modal>
  );
}

/** Full-screen viewer: arrows / swipe / Esc. Works for private (blob) and public images. */
export function Lightbox({ count, index, onIndex, onClose, image, caption }: {
  count: number; index: number; onIndex: (i: number) => void; onClose: () => void; image: React.ReactNode; caption?: string | null;
}) {
  const prev = useCallback(() => onIndex((index - 1 + count) % count), [index, count, onIndex]);
  const next = useCallback(() => onIndex((index + 1) % count), [index, count, onIndex]);
  const touch = useRef<number | null>(null);
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    const o = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = o;
    };
  }, [onClose, prev, next]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
        touch.current = null;
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t('gallery.viewer')}
    >
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
        <X className="h-6 w-6" />
      </button>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full flex-col items-center gap-3">
        {image}
        <p className="text-center text-sm text-white/90">{caption}{count > 1 ? ` · ${index + 1} / ${count}` : ''}</p>
      </div>
      {count > 1 && (
        <>
          <button type="button" aria-label={t('gallery.prev')} onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronLeft className="h-7 w-7" />
          </button>
          <button type="button" aria-label={t('gallery.next')} onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <ChevronRight className="h-7 w-7" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
