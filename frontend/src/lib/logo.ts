'use client';

/** Downscale an image file to ≤512px and encode as PNG/WebP under ~280 KB. */
export async function logoToDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image.'));
      i.src = url;
    });
    for (const max of [512, 384, 256]) {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      for (const [type, q] of [['image/png', undefined], ['image/webp', 0.9], ['image/webp', 0.75]] as const) {
        const data = c.toDataURL(type, q);
        if (data.startsWith(`data:${type}`) && data.length * 0.75 < 280_000) return data;
      }
    }
    throw new Error('That image is too large even after resizing. Try a simpler logo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
