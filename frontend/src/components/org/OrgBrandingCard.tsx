'use client';

import { useRef, useState } from 'react';
import { Building2, ImagePlus, Trash2 } from 'lucide-react';
import { api, errorMessage, uploadForm } from '@/lib/api';
import { apiImageSrc, IMAGE_TYPES, resizeImage } from '@/lib/images';
import { useOrg } from '@/lib/org-context';
import { Alert, Button, Card, SectionTitle } from '../ui';

type Kind = 'logo' | 'banner';

const LIMITS: Record<Kind, { max: number; widthOnly: boolean; maxBytes: number; label: string; hint: string }> = {
  logo: { max: 512, widthOnly: false, maxBytes: 512 * 1024, label: 'Mandal logo', hint: 'Square works best. Resized to 512 px on your phone before upload (max 512 KB).' },
  banner: { max: 1920, widthOnly: true, maxBytes: 2 * 1024 * 1024, label: 'Banner image', hint: 'A wide photo of your pandal (about 3:1). Resized to 1920 px wide (max 2 MB).' },
};

/** Upload / replace / remove the mandal logo and banner with a live preview. */
export function OrgBrandingCard() {
  const org = useOrg();
  return (
    <Card>
      <SectionTitle icon={ImagePlus}>Logo &amp; banner</SectionTitle>
      <p className="mb-3 text-sm text-slate-600">Shown on your festival pages, booking page, explore cards, passes and donation receipts.</p>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <ImagePicker kind="logo" current={org.org?.logoUrl ?? null} onDone={org.reload} />
        <ImagePicker kind="banner" current={org.org?.bannerUrl ?? null} onDone={org.reload} />
      </div>
    </Card>
  );
}

function ImagePicker({ kind, current, onDone }: { kind: Kind; current: string | null; onDone: () => void }) {
  const org = useOrg();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const L = LIMITS[kind];
  const src = preview ?? apiImageSrc(current);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!IMAGE_TYPES.test(file.type)) return setError('Choose a PNG, JPG or WebP image.');
    try {
      const { blob } = await resizeImage(file, { max: L.max, widthOnly: L.widthOnly, maxBytes: L.maxBytes, keepAlpha: kind === 'logo' });
      const local = URL.createObjectURL(blob);
      setPreview(local);
      const form = new FormData();
      form.append('file', blob, `${kind}.${blob.type.split('/')[1]}`);
      setProgress(0);
      await uploadForm(`/organizations/${org.orgId}/${kind}`, form, { method: 'PUT', onProgress: setProgress });
      onDone();
    } catch (e) {
      setPreview(null);
      setError(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  }

  async function remove() {
    setError(null);
    try {
      await api.del(`/organizations/${org.orgId}/${kind}`);
      setPreview(null);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-800">{L.label}</span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={
          kind === 'logo'
            ? 'relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-orange-300 bg-orange-50'
            : 'relative flex aspect-[3/1] w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-orange-300 bg-gradient-to-r from-amber-100 to-rose-100'
        }
        aria-label={`Choose ${L.label.toLowerCase()}`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className={kind === 'logo' ? 'h-full w-full object-contain p-2' : 'h-full w-full object-cover'} />
        ) : (
          <span className="flex flex-col items-center gap-1 text-orange-700">
            {kind === 'logo' ? <Building2 aria-hidden className="h-8 w-8" /> : <ImagePlus aria-hidden className="h-8 w-8" />}
            <span className="text-xs font-semibold">Tap to upload</span>
          </span>
        )}
        {progress !== null && (
          <span className="absolute inset-x-0 bottom-0 h-1.5 bg-white/60">
            <span className="block h-full bg-orange-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <p className="text-xs text-slate-500">{L.hint}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()} loading={progress !== null}>
          <ImagePlus aria-hidden className="h-4 w-4" /> {current ? 'Replace' : 'Upload'}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={() => void remove()}>
            <Trash2 aria-hidden className="h-4 w-4" /> Remove
          </Button>
        )}
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
