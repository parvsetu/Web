'use client';

import { useMemo, useState } from 'react';
import { Heart, Instagram, Palette, Sparkles } from 'lucide-react';
import { apiImageSrc } from '@/lib/media';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/provider';
import { BookingError, publicApi } from '@/lib/booking';
import type { PublicArtwork } from '@/lib/art-types';
import { Alert, Button, LabeledInput, Modal, Textarea } from '../ui';

type Filter = 'ALL' | 'SALE' | 'DISPLAY';

/** Festival page: the art gallery — a grid with For sale / On display filters, a detail view and an "I'm interested" form. */
export function PublicArtGallery({ artworks, accent }: { artworks: PublicArtwork[]; accent: string }) {
  const { t, tp } = useT();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [open, setOpen] = useState<PublicArtwork | null>(null);
  const hasSale = artworks.some((a) => a.mode === 'SALE');
  const hasDisplay = artworks.some((a) => a.mode === 'DISPLAY');
  const shown = useMemo(() => artworks.filter((a) => filter === 'ALL' || a.mode === filter), [artworks, filter]);
  if (!artworks.length) return null;

  return (
    <section id="art" className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Palette aria-hidden className="h-5 w-5" style={{ color: accent }} /> {t('art.title')}
        </h2>
        <span className="text-sm text-slate-500">{tp('art.count', artworks.length)}</span>
      </div>
      {hasSale && hasDisplay && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('art.title')}>
          {(['ALL', 'SALE', 'DISPLAY'] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={cx('min-h-[36px] rounded-full border px-3 text-sm font-semibold', filter === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700')}>
              {f === 'ALL' ? t('art.all') : f === 'SALE' ? t('art.forSale') : t('art.display')}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? <p className="text-sm text-slate-500">{t('art.noneForFilter')}</p> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => setOpen(a)} className="group flex w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left">
                <span className="relative block aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-amber-50 to-rose-100">
                  {a.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={apiImageSrc(a.thumbUrl)!} alt={a.title} loading="lazy" className={cx('h-full w-full object-cover transition group-hover:scale-105', a.saleStatus === 'SOLD' && 'opacity-80')} />
                  ) : (
                    <span className="flex h-full items-center justify-center"><Palette aria-hidden className="h-10 w-10 text-rose-300" /></span>
                  )}
                  <span className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {a.isFeatured && <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-amber-950"><Sparkles aria-hidden className="h-3 w-3" /> {t('art.featured')}</span>}
                    <StatusBadge a={a} />
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 p-2">
                  <span className="line-clamp-2 font-bold leading-tight">{a.title}</span>
                  <span className="truncate text-xs text-slate-500">{t('art.by', { artist: a.artistName })}</span>
                  <span className="text-sm font-extrabold" style={{ color: accent }}>
                    {a.mode === 'SALE' && a.price ? `₹${Number(a.price).toLocaleString('en-IN')}` : <span className="text-xs font-semibold text-slate-500">{t('art.displayOnly')}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && <ArtworkDetail a={open} accent={accent} onClose={() => setOpen(null)} />}
    </section>
  );
}

function StatusBadge({ a }: { a: PublicArtwork }) {
  const { t } = useT();
  if (a.mode !== 'SALE') return null;
  if (a.saleStatus === 'SOLD') return <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{t('art.sold')}</span>;
  if (a.saleStatus === 'RESERVED') return <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white">{t('art.reserved')}</span>;
  return <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">{t('art.forSale')}</span>;
}

function ArtworkDetail({ a, accent, onClose }: { a: PublicArtwork; accent: string; onClose: () => void }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const size = a.widthCm && a.heightCm ? (a.depthCm ? t('art.sizeD', { w: a.widthCm, h: a.heightCm, d: a.depthCm }) : t('art.size', { w: a.widthCm, h: a.heightCm })) : null;
  const canEnquire = a.mode === 'SALE' && a.saleStatus !== 'SOLD';
  return (
    <Modal open onClose={onClose} title={a.title} wide>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-1/2">
          {a.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={apiImageSrc(a.imageUrl)!} alt={a.title} className="max-h-[70vh] w-full rounded-xl bg-slate-100 object-contain" />
          ) : (
            <div className="flex aspect-[4/5] items-center justify-center rounded-xl bg-gradient-to-br from-amber-50 to-rose-100"><Palette aria-hidden className="h-16 w-16 text-rose-300" /></div>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:w-1/2">
          <div className="flex flex-wrap gap-1"><StatusBadge a={a} /></div>
          <p className="text-lg font-bold">{t('art.by', { artist: a.artistName })}</p>
          <p className="text-sm text-slate-600">{[a.medium, size, a.year].filter(Boolean).join(' · ')}</p>
          {a.mode === 'SALE' && a.price && <p className="text-2xl font-extrabold" style={{ color: accent }}>₹{Number(a.price).toLocaleString('en-IN')}</p>}
          {a.description && <p className="whitespace-pre-line text-sm text-slate-700">{a.description}</p>}
          {a.artistBio && <p className="rounded-lg bg-slate-50 p-2 text-sm text-slate-700">{a.artistBio}</p>}
          {a.artistInstagram && (
            <a href={a.artistInstagram} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-sm font-semibold text-pink-700 underline-offset-2 hover:underline">
              <Instagram aria-hidden className="h-4 w-4" /> {t('prog.instagram')}
            </a>
          )}
          {canEnquire && !asking && (
            <Button size="lg" className="mt-2" onClick={() => setAsking(true)}><Heart aria-hidden className="h-5 w-5" /> {t('art.interested')}</Button>
          )}
          {canEnquire && asking && <EnquiryForm a={a} />}
        </div>
      </div>
    </Modal>
  );
}

function EnquiryForm({ a }: { a: PublicArtwork }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await publicApi.post(`/public/artworks/${a.id}/enquiries`, { name, phone, email: email || undefined, message: message || undefined, website: website || undefined });
      setDone(true);
    } catch (err) {
      setError(err instanceof BookingError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) return <Alert kind="success">{t('art.sent')}</Alert>;
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
      <p className="font-bold">{t('art.enquiryTitle', { title: a.title })}</p>
      <p className="text-xs text-slate-500">{t('art.enquiryNote')}</p>
      <LabeledInput label={t('art.yourName')} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={100} autoComplete="name" />
      <LabeledInput label={t('art.phone')} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required autoComplete="tel" />
      <LabeledInput label={t('art.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <label className="flex flex-col gap-1 text-sm font-semibold">
        {t('art.message')}
        <Textarea rows={2} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" aria-hidden />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" loading={busy}>{t('art.send')}</Button>
    </form>
  );
}
