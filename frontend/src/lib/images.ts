'use client';

import { useEffect, useState } from 'react';
import { fetchBlob } from './api';

export { apiImageSrc } from './media';

export const IMAGE_TYPES = /^image\/(png|jpeg|webp)$/;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read that image.'));
    i.src = url;
  }).finally(() => setTimeout(() => URL.revokeObjectURL(url), 1000));
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => c.toBlob(resolve, type, quality));
}

/**
 * Downscales an image on the phone before upload (canvas): the longest side
 * (or the width with `widthOnly`) is capped at `max`, encoded as WebP (JPEG
 * where WebP encoding isn't supported) at `quality`, stepping quality down
 * until it fits `maxBytes`. Keeps uploads small on mobile data.
 */
export async function resizeImage(file: Blob, o: { max: number; widthOnly?: boolean; quality?: number; maxBytes: number; keepAlpha?: boolean }) {
  if (!IMAGE_TYPES.test(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
  const img = await loadImage(file);
  const side = o.widthOnly ? img.width : Math.max(img.width, img.height);
  let scale = Math.min(1, o.max / side);
  for (let attempt = 0; attempt < 4; attempt++, scale *= 0.8) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const ctx = c.getContext('2d')!;
    if (!o.keepAlpha) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [o.quality ?? 0.85, 0.75, 0.6]) {
      let blob = await toBlob(c, 'image/webp', q);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob(c, o.keepAlpha ? 'image/png' : 'image/jpeg', q);
      if (blob && blob.size <= o.maxBytes) return { blob, width: c.width, height: c.height };
    }
  }
  throw new Error('That image is too large even after resizing.');
}

/** Object URLs of authenticated images, shared across components for the session. */
const authedCache = new Map<string, Promise<string>>();

/** Loads a private API image (bearer token) as an object URL; null while loading or on error. */
export function useAuthedImage(path: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return setSrc(null);
    let alive = true;
    let p = authedCache.get(path);
    if (!p) {
      p = fetchBlob(path).then((b) => URL.createObjectURL(b));
      authedCache.set(path, p);
      p.catch(() => authedCache.delete(path));
    }
    p.then((u) => alive && setSrc(u)).catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [path]);
  return src;
}

export function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
