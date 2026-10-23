'use client';

import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, RotateCcw, Share2, Trash2 } from 'lucide-react';
import { saveBlob } from '@/lib/api';
import { festivalTheme, type FestivalTheme } from '@/lib/festival-theme';
import { Alert, Button, Checkbox, Field, LabeledInput, Textarea, cx } from '../ui';

/**
 * Edit the Instagram / WhatsApp status poster in the browser: headline, lines
 * of text, call to action, colours, an optional banner photo and a QR to the
 * festival page. Drawn on a 1080×1080 canvas and downloaded / shared as a PNG —
 * nothing is uploaded. Text settings are remembered per festival on this device.
 */

const SIZE = 1080;
const MAX_BANNER_BYTES = 10 * 1024 * 1024;

type Palette = Pick<FestivalTheme, 'from' | 'via' | 'to' | 'ink'>;
const PALETTES: { key: string; label: string; colors?: Palette }[] = [
  { key: 'festival', label: 'Festival colours' },
  { key: 'saffron', label: 'Saffron', colors: { from: '#FBBF24', via: '#F97316', to: '#C2410C', ink: '#C2410C' } },
  { key: 'royal', label: 'Royal red', colors: { from: '#DC2626', via: '#991B1B', to: '#450A0A', ink: '#991B1B' } },
  { key: 'peacock', label: 'Peacock', colors: { from: '#06B6D4', via: '#0E7490', to: '#1E3A8A', ink: '#0E7490' } },
  { key: 'marigold', label: 'Marigold & green', colors: { from: '#F59E0B', via: '#65A30D', to: '#166534', ink: '#166534' } },
  { key: 'night', label: 'Festive night', colors: { from: '#7C3AED', via: '#4C1D95', to: '#111827', ink: '#5B21B6' } },
];

export interface PosterFestival {
  eventId: string;
  name: string;
  orgName: string;
  festivalType: string;
  startDate: string;
  endDate: string;
  place: string;
  url: string;
  bookable: boolean;
}

interface PosterText {
  kicker: string;
  headline: string;
  subline: string;
  message: string;
  cta: string;
  showDates: boolean;
  showQr: boolean;
  palette: string;
}

function defaults(f: PosterFestival): PosterText {
  const th = festivalTheme(f.festivalType);
  return {
    kicker: th.label === 'Festival' ? f.festivalType.replace(/_/g, ' ') : th.label,
    headline: f.name,
    subline: f.orgName,
    message: '',
    cta: f.bookable ? 'Book your passes online' : 'All are welcome',
    showDates: true,
    showQr: true,
    palette: 'festival',
  };
}

const storeKey = (id: string) => `parvsetu.poster.${id}`;

function loadSaved(f: PosterFestival): PosterText {
  const base = defaults(f);
  try {
    const raw = localStorage.getItem(storeKey(f.eventId));
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<PosterText>) };
  } catch {
    /* private mode / bad JSON — start from defaults */
  }
  return base;
}

function dateRange(start: string, end: string) {
  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (!start) return '';
  return !end || start.slice(0, 10) === end.slice(0, 10) ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed'));
    img.src = src;
  });
}

/** Word-wrap `text` to at most `maxLines` lines of `maxWidth`, ellipsising the last one. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  if (out.length <= maxLines) return out;
  const kept = out.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const FONT = 'system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans Devanagari", sans-serif';

async function drawPoster(canvas: HTMLCanvasElement, f: PosterFestival, p: PosterText, banner: HTMLImageElement | null) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const pal = PALETTES.find((x) => x.key === p.palette)?.colors ?? festivalTheme(f.festivalType);
  canvas.width = SIZE;
  canvas.height = SIZE;

  const bg = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  bg.addColorStop(0, pal.from);
  bg.addColorStop(0.55, pal.via);
  bg.addColorStop(1, pal.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  let y: number;
  const artSize = banner ? 200 : 320;
  if (banner) {
    // Banner photo, cover-fitted into the top band, fading into the colours below.
    const bandH = 470;
    const scale = Math.max(SIZE / banner.width, bandH / banner.height);
    const w = banner.width * scale;
    const h = banner.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, SIZE, bandH);
    ctx.clip();
    ctx.drawImage(banner, (SIZE - w) / 2, (bandH - h) / 2, w, h);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, bandH - 200, 0, bandH);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, pal.via);
    ctx.fillStyle = fade;
    ctx.fillRect(0, bandH - 200, SIZE, 200);
    y = bandH - artSize / 2;
  } else {
    y = 70;
  }

  // Festival illustration in a white disc.
  const art = await loadImage(`/art/${/^[A-Z_]+$/.test(f.festivalType) ? f.festivalType : 'DEFAULT'}.svg`).catch(() => loadImage('/art/DEFAULT.svg').catch(() => null));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.beginPath();
  ctx.arc(SIZE / 2, y + artSize / 2, artSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (art) {
    const inner = artSize * 0.78;
    ctx.drawImage(art, (SIZE - inner) / 2, y + (artSize - inner) / 2, inner, inner);
  }
  y += artSize + 44;

  const qrSize = p.showQr ? 190 : 0;
  const textWidth = SIZE - 2 * 80;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';

  if (p.kicker.trim()) {
    ctx.font = `600 28px ${FONT}`;
    ctx.globalAlpha = 0.9;
    const k = p.kicker.trim().toUpperCase().split('').join(String.fromCharCode(8202));
    ctx.fillText(wrap(ctx, k, textWidth, 1)[0], SIZE / 2, y);
    ctx.globalAlpha = 1;
    y += 44;
  }

  // Headline: shrink until it fits in two lines.
  const headline = p.headline.trim() || f.name;
  let hs = banner ? 70 : 78;
  let lines: string[];
  for (;;) {
    ctx.font = `800 ${hs}px ${FONT}`;
    lines = wrap(ctx, headline, textWidth, 99);
    if (lines.length <= 2 || hs <= 48) break;
    hs -= 4;
  }
  lines = wrap(ctx, headline, textWidth, 2);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 12;
  for (const l of lines) {
    ctx.fillText(l, SIZE / 2, y);
    y += hs * 1.1;
  }
  ctx.restore();
  y += 10;

  if (p.subline.trim()) {
    ctx.font = `500 34px ${FONT}`;
    ctx.globalAlpha = 0.95;
    ctx.fillText(wrap(ctx, p.subline.trim(), textWidth, 1)[0], SIZE / 2, y);
    ctx.globalAlpha = 1;
    y += 50;
  }

  if (p.showDates) {
    const d = [dateRange(f.startDate, f.endDate), f.place].filter(Boolean).join(' · ');
    if (d) {
      ctx.font = `500 30px ${FONT}`;
      ctx.fillText(wrap(ctx, d, textWidth, 1)[0], SIZE / 2, y);
      y += 48;
    }
  }

  if (p.message.trim()) {
    ctx.font = `500 30px ${FONT}`;
    // Keep clear of the QR in the bottom-right corner.
    for (const l of wrap(ctx, p.message.trim(), textWidth - (p.showQr ? 120 : 0), 3)) {
      ctx.fillText(l, SIZE / 2, y);
      y += 40;
    }
    y += 6;
  }

  if (p.cta.trim()) {
    ctx.font = `800 32px ${FONT}`;
    const label = wrap(ctx, p.cta.trim(), textWidth - 60 - (p.showQr ? 2 * qrSize : 0), 1)[0];
    const w = ctx.measureText(label).width + 64;
    const top = Math.min(y + 14, SIZE - 150);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, (SIZE - w) / 2, top, w, 66, 33);
    ctx.fill();
    ctx.fillStyle = pal.ink;
    ctx.fillText(label, SIZE / 2, top + 16);
    ctx.fillStyle = '#ffffff';
  }

  ctx.font = `500 22px ${FONT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText('🪔 Parvsetu', SIZE / 2, SIZE - 50);
  ctx.globalAlpha = 1;

  if (p.showQr && f.url) {
    const qr = document.createElement('canvas');
    await QRCode.toCanvas(qr, f.url, { errorCorrectionLevel: 'M', margin: 1, width: qrSize - 24 });
    const x = SIZE - qrSize - 40;
    const top = SIZE - qrSize - 76;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x, top, qrSize, qrSize + 36, 20);
    ctx.fill();
    ctx.drawImage(qr, x + 12, top + 12, qrSize - 24, qrSize - 24);
    ctx.fillStyle = pal.ink;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('Scan to book', x + qrSize / 2, top + qrSize - 6);
  }
}

export function PosterEditor({ festival }: { festival: PosterFestival }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Opened from a button (client only), so the saved text can be read on first render.
  const [p, setP] = useState<PosterText>(() => (typeof window === 'undefined' ? defaults(festival) : loadSaved(festival)));
  const [banner, setBanner] = useState<{ img: HTMLImageElement; url: string } | null>(null);
  const [busy, setBusy] = useState<'download' | 'share' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(festival.eventId), JSON.stringify(p));
    } catch {
      /* not remembered — fine */
    }
  }, [festival.eventId, p]);

  useEffect(() => () => {
    if (banner) URL.revokeObjectURL(banner.url);
  }, [banner]);

  // Redraw on every change; a stale async draw is dropped.
  useEffect(() => {
    let current = true;
    const target = document.createElement('canvas');
    void drawPoster(target, festival, p, banner?.img ?? null).then(() => {
      const c = canvasRef.current;
      if (!current || !c) return;
      c.width = SIZE;
      c.height = SIZE;
      c.getContext('2d')?.drawImage(target, 0, 0);
    });
    return () => {
      current = false;
    };
  }, [festival, p, banner]);

  const set = <K extends keyof PosterText>(k: K, v: PosterText[K]) => setP((x) => ({ ...x, [k]: v }));
  const fileName = `${festival.name.replace(/[^\w-]+/g, '-')}-poster.png`;

  async function pickBanner(file: File | undefined) {
    setMsg(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg('Choose a photo (JPG, PNG or WebP).');
    if (file.size > MAX_BANNER_BYTES) return setMsg('That photo is over 10 MB — choose a smaller one.');
    const url = URL.createObjectURL(file);
    try {
      setBanner({ img: await loadImage(url), url });
    } catch {
      URL.revokeObjectURL(url);
      setMsg('Could not read that photo. Try another one.');
    }
  }

  function toBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const c = canvasRef.current;
      if (!c) return reject(new Error('no canvas'));
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png');
    });
  }

  async function download() {
    setMsg(null);
    setBusy('download');
    try {
      saveBlob(await toBlob(), fileName);
    } catch {
      setMsg('Could not create the poster image.');
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setMsg(null);
    setBusy('share');
    try {
      const file = new File([await toBlob()], fileName, { type: 'image/png' });
      const text = `🙏 ${festival.name} — ${festival.orgName} ${festival.url}`;
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
      else {
        saveBlob(file, fileName);
        setMsg('Saved the poster — post it from your gallery.');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMsg('Could not share the poster.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} role="img" aria-label="Poster preview" className="aspect-square w-full rounded-2xl bg-slate-100 shadow" />
        <div className={cx('grid gap-2', canShare ? 'grid-cols-2' : 'grid-cols-1')}>
          <Button onClick={() => void download()} loading={busy === 'download'}>
            {busy !== 'download' && <Download aria-hidden className="h-5 w-5" />} Download poster
          </Button>
          {canShare && (
            <Button variant="secondary" onClick={() => void share()} loading={busy === 'share'}>
              {busy !== 'share' && <Share2 aria-hidden className="h-5 w-5" />} Share
            </Button>
          )}
        </div>
        {msg && <Alert kind="warning">{msg}</Alert>}
      </div>

      <div className="flex flex-col gap-3">
        <Field label="Banner photo (optional)">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 font-semibold text-slate-800 hover:bg-orange-50">
              <ImagePlus aria-hidden className="h-5 w-5" /> {banner ? 'Change photo' : 'Add a photo'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pickBanner(e.target.files?.[0])} />
            </label>
            {banner && (
              <Button variant="secondary" size="sm" onClick={() => setBanner(null)}>
                <Trash2 aria-hidden className="h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">Your pandal, idol or last year&rsquo;s crowd — shown across the top. It stays on this device.</p>
        </Field>
        <LabeledInput label="Small line on top" value={p.kicker} maxLength={40} onChange={(e) => set('kicker', e.target.value)} />
        <LabeledInput label="Headline" value={p.headline} maxLength={80} onChange={(e) => set('headline', e.target.value)} />
        <LabeledInput label="Second line" value={p.subline} maxLength={80} onChange={(e) => set('subline', e.target.value)} />
        <Field label="Message (optional)">
          <Textarea value={p.message} maxLength={160} rows={3} onChange={(e) => set('message', e.target.value)} placeholder="e.g. Maha aarti every evening at 7 pm · Cultural night on Saturday" />
        </Field>
        <LabeledInput label="Button text" value={p.cta} maxLength={40} onChange={(e) => set('cta', e.target.value)} hint="Leave empty to hide the button." />
        <Field label="Colours">
          <div className="flex flex-wrap gap-2">
            {PALETTES.map((x) => {
              const c = x.colors ?? festivalTheme(festival.festivalType);
              return (
                <button
                  key={x.key}
                  type="button"
                  aria-pressed={p.palette === x.key}
                  onClick={() => set('palette', x.key)}
                  className={cx('flex min-h-[44px] items-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold', p.palette === x.key ? 'border-slate-900' : 'border-slate-200')}
                >
                  <span aria-hidden className="h-5 w-5 rounded-full" style={{ background: `linear-gradient(135deg, ${c.from}, ${c.via}, ${c.to})` }} />
                  {x.label}
                </button>
              );
            })}
          </div>
        </Field>
        <Checkbox label="Show dates and place" checked={p.showDates} onChange={(v) => set('showDates', v)} />
        <Checkbox label="Add a QR to the festival page" checked={p.showQr} onChange={(v) => set('showQr', v)} />
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setP(defaults(festival))}>
          <RotateCcw aria-hidden className="h-4 w-4" /> Reset text
        </Button>
      </div>
    </div>
  );
}
