'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Download, Facebook, Instagram, MessageCircle, Send, Share2, Twitter } from 'lucide-react';
import { cx } from './ui';
import { useT } from '@/lib/i18n/provider';

/**
 * Share a festival link: WhatsApp / Facebook / X / Telegram intents, copy
 * link, the phone's share sheet, and the Instagram poster (Instagram has no
 * web share link, so the poster is shared as an image or downloaded).
 */
export function ShareButtons({ url, text, posterUrl, posterName }: { url: string; text: string; posterUrl?: string; posterName?: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { t } = useT();
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);
  const enc = encodeURIComponent;
  const links = [
    { label: 'WhatsApp', icon: MessageCircle, href: `https://wa.me/?text=${enc(`${text} ${url}`)}`, cls: 'bg-[#25D366] text-white' },
    { label: 'Facebook', icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, cls: 'bg-[#1877F2] text-white' },
    { label: 'X', icon: Twitter, href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, cls: 'bg-black text-white' },
    { label: 'Telegram', icon: Send, href: `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`, cls: 'bg-[#229ED9] text-white' },
  ];

  async function sharePoster() {
    setMsg(null);
    if (!posterUrl) return;
    try {
      const blob = await (await fetch(posterUrl)).blob();
      const file = new File([blob], `${posterName ?? 'festival'}-poster.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `${text} ${url}` });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
        setMsg(t('share.posterSaved'));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMsg(t('share.posterFailed'));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={cx('flex min-h-[48px] items-center justify-center gap-2 rounded-xl font-semibold shadow-sm', l.cls)}>
            <l.icon aria-hidden className="h-5 w-5" /> {l.label}
          </a>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {posterUrl && (
          <button type="button" onClick={() => void sharePoster()} className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#F58529] via-[#DD2A7B] to-[#8134AF] font-semibold text-white shadow-sm">
            <Instagram aria-hidden className="h-5 w-5 shrink-0" /> {t('share.instagram')}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            try {
              if (canShare) await navigator.share({ title: text, url });
              else {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            } catch {
              /* cancelled */
            }
          }}
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-orange-200 bg-white font-semibold text-slate-800"
        >
          {canShare ? <Share2 aria-hidden className="h-5 w-5" /> : copied ? <Check aria-hidden className="h-5 w-5 text-green-600" /> : <Copy aria-hidden className="h-5 w-5" />}
          {canShare ? t('share.more') : copied ? t('common.copied') : t('common.copyLink')}
        </button>
      </div>
      {posterUrl && (
        <a href={`${posterUrl}?download=1`} className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-orange-700 hover:underline">
          <Download aria-hidden className="h-4 w-4" /> {t('share.downloadPoster')}
        </a>
      )}
      {msg && <p className="text-center text-sm text-slate-600">{msg}</p>}
    </div>
  );
}
