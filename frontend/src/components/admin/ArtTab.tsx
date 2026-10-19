'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EyeOff, ImagePlus, Inbox, Palette, Pencil, Phone, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorMessage, uploadForm } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import { fmtDateTime } from '@/lib/format';
import { IMAGE_TYPES, resizeImage, useAuthedImage } from '@/lib/images';
import { cx } from '@/lib/cx';
import type { Paged } from '@/lib/types';
import type { AdminArtwork, ArtEnquiry, ArtMode, SaleStatus } from '@/lib/art-types';
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, LabeledInput, LabeledSelect, Modal, SkeletonList, Tabs, Textarea } from '../ui';

/** Festival admin → Art gallery: artworks (display only or for sale) and buyer enquiries. */
export function ArtTab() {
  const [view, setView] = useState<'works' | 'enquiries'>('works');
  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        Show the art at your festival: each piece is <strong>display only</strong> or <strong>for sale</strong> with a price. Visitors browse it on the festival page and
        tap “I&apos;m interested” — you get their name and phone under Enquiries, arrange the viewing and payment directly with the buyer, then mark the piece sold.
        Images count toward your 300 MB photo space.
      </Alert>
      <Tabs tabs={[{ key: 'works', label: 'Artworks' }, { key: 'enquiries', label: 'Enquiries' }]} active={view} onChange={(k) => setView(k as typeof view)} />
      {view === 'works' ? <Works /> : <Enquiries />}
    </div>
  );
}

function Works() {
  const ev = useEvent();
  const q = useAsync(() => api.get<AdminArtwork[]>(`/events/${ev.eventId}/artworks`), [ev.eventId]);
  const [editing, setEditing] = useState<AdminArtwork | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = q.data ?? [];

  async function setStatus(a: AdminArtwork, saleStatus: SaleStatus) {
    setError(null);
    try {
      await api.patch(`/events/${ev.eventId}/artworks/${a.id}`, { saleStatus });
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(a: AdminArtwork) {
    if (!window.confirm(`Delete “${a.title}”? Its image and enquiries are deleted too.`)) return;
    try {
      await api.del(`/events/${ev.eventId}/artworks/${a.id}`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const sale = list.filter((a) => a.mode === 'SALE');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          {list.length} artworks · {sale.length} for sale · {sale.filter((a) => a.saleStatus === 'SOLD').length} sold
        </p>
        <Button onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add artwork</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : list.length === 0 ? (
        <Empty title="No artworks yet" icon={Palette}>Add paintings, sculptures, photographs or crafts — with a photo, the artist and a price if it is for sale.</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((a) => (
            <li key={a.id}>
              <Card className="flex h-full flex-col gap-2 p-3">
                <Thumb path={a.thumbUrl} />
                <div className="flex flex-wrap gap-1 text-xs font-semibold">
                  <Badge className={a.mode === 'SALE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}>{a.mode === 'SALE' ? 'For sale' : 'Display only'}</Badge>
                  {a.mode === 'SALE' && a.saleStatus !== 'AVAILABLE' && <Badge className={a.saleStatus === 'SOLD' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}>{a.saleStatus === 'SOLD' ? 'Sold' : 'Reserved'}</Badge>}
                  {a.isFeatured && <Badge className="bg-amber-100 text-amber-900"><Sparkles aria-hidden className="mr-0.5 inline h-3 w-3" />Featured</Badge>}
                  {!a.isPublished && <Badge className="bg-slate-200 text-slate-700"><EyeOff aria-hidden className="mr-0.5 inline h-3 w-3" />Hidden</Badge>}
                  {a.newEnquiries > 0 && <Badge className="bg-sky-100 text-sky-800">{a.newEnquiries} new enquir{a.newEnquiries === 1 ? 'y' : 'ies'}</Badge>}
                </div>
                <p className="font-bold leading-tight">{a.title}</p>
                <p className="text-sm text-slate-600">{a.artistName}{a.medium ? ` · ${a.medium}` : ''}</p>
                {a.mode === 'SALE' && a.price && <p className="font-extrabold text-emerald-700">₹{Number(a.price).toLocaleString('en-IN')}</p>}
                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(a)}><Pencil aria-hidden className="h-4 w-4" /> Edit</Button>
                  {a.mode === 'SALE' && a.saleStatus !== 'SOLD' && <Button size="sm" onClick={() => setStatus(a, 'SOLD')}>Mark sold</Button>}
                  {a.mode === 'SALE' && a.saleStatus === 'AVAILABLE' && <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'RESERVED')}>Reserve</Button>}
                  {a.mode === 'SALE' && a.saleStatus !== 'AVAILABLE' && <Button size="sm" variant="ghost" onClick={() => setStatus(a, 'AVAILABLE')}>Make available</Button>}
                  <Button size="sm" variant="ghost" className="text-red-700" onClick={() => remove(a)} aria-label={`Delete ${a.title}`}><Trash2 aria-hidden className="h-4 w-4" /></Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {editing && <ArtworkForm a={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); q.reload(); }} />}
    </div>
  );
}

function Thumb({ path }: { path: string | null }) {
  const src = useAuthedImage(path);
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 to-rose-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><Palette aria-hidden className="h-10 w-10 text-rose-300" /></div>}
    </div>
  );
}

function useObjectUrl(file: File | null) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

function ArtworkForm({ a, onClose, onSaved }: { a: AdminArtwork | null; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const [title, setTitle] = useState(a?.title ?? '');
  const [artistName, setArtist] = useState(a?.artistName ?? '');
  const [artistBio, setBio] = useState(a?.artistBio ?? '');
  const [artistInstagram, setIg] = useState(a?.artistInstagram ?? '');
  const [medium, setMedium] = useState(a?.medium ?? '');
  const [widthCm, setW] = useState(a?.widthCm ?? '');
  const [heightCm, setH] = useState(a?.heightCm ?? '');
  const [depthCm, setD] = useState(a?.depthCm ?? '');
  const [year, setYear] = useState(a?.year ? String(a.year) : '');
  const [description, setDescription] = useState(a?.description ?? '');
  const [mode, setMode] = useState<ArtMode>(a?.mode ?? 'SALE');
  const [price, setPrice] = useState(a?.price ? String(Number(a.price)) : '');
  const [saleStatus, setSaleStatus] = useState<SaleStatus>(a?.saleStatus ?? 'AVAILABLE');
  const [isFeatured, setFeatured] = useState(a?.isFeatured ?? false);
  const [isPublished, setPublished] = useState(a?.isPublished ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const current = useAuthedImage(a?.imageUrl ?? null);
  const preview = useObjectUrl(file) ?? current;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('Enter a title.');
    if (artistName.trim().length < 2) return setError('Enter the artist’s name.');
    if (mode === 'SALE' && !price) return setError('Enter a price, or make it display only.');
    const body = {
      title, artistName, artistBio, artistInstagram, medium, widthCm: widthCm || null, heightCm: heightCm || null, depthCm: depthCm || null,
      year: year ? Number(year) : null, description, mode, price: mode === 'SALE' ? price : null, saleStatus: mode === 'SALE' ? saleStatus : 'AVAILABLE',
      isFeatured, isPublished,
    };
    let saved = false;
    try {
      setBusy('Saving…');
      const r = a ? await api.patch<AdminArtwork>(`/events/${ev.eventId}/artworks/${a.id}`, body) : await api.post<AdminArtwork>(`/events/${ev.eventId}/artworks`, body);
      saved = true;
      if (file) {
        setBusy('Uploading image…');
        const full = await resizeImage(file, { max: 1600, quality: 0.85, maxBytes: 1.9 * 1024 * 1024 });
        const thumb = await resizeImage(full.blob, { max: 480, quality: 0.8, maxBytes: 280 * 1024 });
        const form = new FormData();
        form.append('file', full.blob, `art.${full.blob.type.split('/')[1]}`);
        form.append('thumb', thumb.blob, `thumb.${thumb.blob.type.split('/')[1]}`);
        await uploadForm(`/events/${ev.eventId}/artworks/${r.id}/image`, form, { method: 'PUT' });
      }
      onSaved();
    } catch (err) {
      setError(saved ? `${errorMessage(err)} The artwork was saved — open it again to retry the image.` : errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={a ? 'Edit artwork' : 'Add artwork'} wide>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col gap-2 sm:w-56">
            <button type="button" onClick={() => picker.current?.click()} className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-sm"><ImagePlus aria-hidden className="h-8 w-8" /> Add photo</span>}
            </button>
            <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f && IMAGE_TYPES.test(f.type)) setFile(f); else if (f) setError('Choose a PNG, JPG or WebP image.'); }} />
            <p className="text-xs text-slate-500">A clear, straight photo of the whole piece. Resized on your phone before upload.</p>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            <LabeledInput label="Title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder="Maa Durga in Kalighat style" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LabeledInput label="Artist" value={artistName} maxLength={100} onChange={(e) => setArtist(e.target.value)} placeholder="Sudipta Pal" />
              <LabeledInput label="Artist’s Instagram (optional)" value={artistInstagram} maxLength={200} onChange={(e) => setIg(e.target.value)} placeholder="@artistname" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="col-span-2"><LabeledInput label="Medium" value={medium} maxLength={80} onChange={(e) => setMedium(e.target.value)} placeholder="Acrylic on canvas" /></div>
              <LabeledInput label="Width cm" inputMode="decimal" value={widthCm} onChange={(e) => setW(e.target.value.replace(/[^\d.]/g, ''))} />
              <LabeledInput label="Height cm" inputMode="decimal" value={heightCm} onChange={(e) => setH(e.target.value.replace(/[^\d.]/g, ''))} />
              <LabeledInput label="Depth cm" inputMode="decimal" value={depthCm} onChange={(e) => setD(e.target.value.replace(/[^\d.]/g, ''))} placeholder="3D only" />
            </div>
            <LabeledInput label="Year (optional)" type="number" min={1800} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>
        <Field label="About the artwork (optional)">
          <Textarea rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="About the artist (optional)">
          <Textarea rows={2} value={artistBio} maxLength={600} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label="Display or sale">
          <div className="flex gap-2">
            {([['SALE', 'For sale'], ['DISPLAY', 'Display only']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={mode === v} onClick={() => setMode(v)}
                className={cx('min-h-[44px] flex-1 rounded-xl border-2 px-2 text-sm font-semibold', mode === v ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600')}>{l}</button>
            ))}
          </div>
        </Field>
        {mode === 'SALE' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledInput label="Price ₹" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="18000" hint="Buyers pay you or the artist directly; Parvsetu takes no payment or fee on artworks." />
            <LabeledSelect label="Status" value={saleStatus} onChange={(e) => setSaleStatus(e.target.value as SaleStatus)}>
              <option value="AVAILABLE">Available</option><option value="RESERVED">Reserved</option><option value="SOLD">Sold</option>
            </LabeledSelect>
          </div>
        )}
        <div className="flex flex-col">
          <Checkbox label="Featured — shown first" checked={isFeatured} onChange={setFeatured} />
          <Checkbox label="Published — show on the festival page" checked={isPublished} onChange={setPublished} />
        </div>
        {error && <Alert>{error}</Alert>}
        <div className="flex items-center justify-end gap-2">
          {busy && <span className="text-sm text-slate-500">{busy}</span>}
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!!busy}>{a ? 'Save changes' : 'Add artwork'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Enquiries() {
  const ev = useEvent();
  const [status, setStatus] = useState<'' | 'NEW' | 'CONTACTED' | 'CLOSED'>('NEW');
  const q = useAsync(() => api.get<Paged<ArtEnquiry>>(`/events/${ev.eventId}/artwork-enquiries`, { status: status || undefined, pageSize: 100 }), [ev.eventId, status]);
  const [error, setError] = useState<string | null>(null);

  async function move(e: ArtEnquiry, to: ArtEnquiry['status']) {
    setError(null);
    try {
      await api.patch(`/events/${ev.eventId}/artwork-enquiries/${e.id}`, { status: to });
      q.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const rows = q.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="w-52">
        <LabeledSelect label="Show" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="NEW">New</option><option value="CONTACTED">Contacted</option><option value="CLOSED">Closed</option><option value="">All</option>
        </LabeledSelect>
      </div>
      {error && <Alert>{error}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? <SkeletonList /> : rows.length === 0 ? (
        <Empty title="No enquiries" icon={Inbox}>When someone taps “I&apos;m interested” on a piece for sale, they appear here.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((e) => (
            <li key={e.id}>
              <Card className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{e.name} <span className="font-normal text-slate-500">· {fmtDateTime(e.createdAt)}</span></p>
                  <p className="text-sm">
                    <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-700"><Phone aria-hidden className="h-4 w-4" /> {e.phone}</a>
                    {e.email ? <span className="text-slate-600"> · {e.email}</span> : null}
                  </p>
                  <p className="text-sm text-slate-600">For “{e.artwork.title}” by {e.artwork.artistName}{e.artwork.price ? ` · ₹${Number(e.artwork.price).toLocaleString('en-IN')}` : ''}{e.artwork.saleStatus !== 'AVAILABLE' ? ` · ${e.artwork.saleStatus.toLowerCase()}` : ''}</p>
                  {e.message && <p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-sm">{e.message}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge value={e.status} />
                  {e.status !== 'CONTACTED' && <Button size="sm" variant="secondary" onClick={() => move(e, 'CONTACTED')}>Contacted</Button>}
                  {e.status !== 'CLOSED' && <Button size="sm" variant="ghost" onClick={() => move(e, 'CLOSED')}>Close</Button>}
                  {e.status === 'CLOSED' && <Button size="sm" variant="ghost" onClick={() => move(e, 'NEW')}>Reopen</Button>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
