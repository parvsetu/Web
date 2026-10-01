'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { cx } from './ui';

/** Render a token's `qrPayload` string as a QR image (data URL). */
export function QrImage({ payload, size = 320, className, alt }: { payload: string; size?: number; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, { errorCorrectionLevel: 'M', margin: 2, width: size, color: { dark: '#000000', light: '#ffffff' } })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [payload, size]);
  if (!src) return <div className={cx('animate-pulse bg-slate-200', className)} style={{ width: size, height: size, maxWidth: '100%' }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? 'QR code'} width={size} height={size} className={cx('h-auto max-w-full', className)} style={{ imageRendering: 'pixelated' }} />;
}

/** Build a PNG Blob with the QR plus a caption (token code + validity) for sharing/downloading. */
export async function qrCardPng(payload: string, lines: string[]): Promise<Blob> {
  const qrSize = 600;
  const pad = 40;
  const lineH = 44;
  const canvas = document.createElement('canvas');
  canvas.width = qrSize + pad * 2;
  canvas.height = qrSize + pad * 2 + lines.length * lineH + 10;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, payload, { errorCorrectionLevel: 'M', margin: 1, width: qrSize });
  ctx.drawImage(qrCanvas, pad, pad, qrSize, qrSize);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  lines.forEach((line, i) => {
    ctx.font = i === 0 ? 'bold 36px system-ui, sans-serif' : '26px system-ui, sans-serif';
    ctx.fillText(line, canvas.width / 2, qrSize + pad * 2 + i * lineH + 20);
  });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
}
