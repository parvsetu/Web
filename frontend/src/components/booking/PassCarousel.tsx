'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { saveBlob } from '@/lib/api';
import { fmtPassWindow } from '@/lib/booking';
import type { Pass, PassOrder } from '@/lib/booking-types';
import { qrCardPng } from '../QrImage';
import { Button, cx } from '../ui';
import { PassActions, PassCard } from './PassCard';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Several passes on one order (one QR per person): a swipeable row on screen,
 * one ticket per printed page.
 */
export function PassCarousel({ order, passes }: { order: PassOrder; passes: Pass[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const total = passes.length;

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      const slides = Array.from(el.children) as HTMLElement[];
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      slides.forEach((s, i) => {
        if (Math.abs(s.offsetLeft + s.offsetWidth / 2 - mid) < Math.abs(slides[best].offsetLeft + slides[best].offsetWidth / 2 - mid)) best = i;
      });
      setActive(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  function go(i: number) {
    const el = track.current;
    const slide = el?.children[Math.max(0, Math.min(total - 1, i))] as HTMLElement | undefined;
    if (el && slide) el.scrollTo({ left: slide.offsetLeft - (el.clientWidth - slide.offsetWidth) / 2, behavior: 'smooth' });
  }

  async function downloadAll() {
    setBusy(true);
    setMsg(null);
    try {
      for (let i = 0; i < total; i++) {
        const p = passes[i];
        const blob = await qrCardPng(p.qrPayload, [
          p.tokenCode,
          order.event.name,
          order.timeSlot?.label ?? '',
          fmtPassWindow(order.validFrom, order.validUntil, order.event.timezone),
          `Pass ${i + 1} of ${total} · admits ${p.admits ?? 1}`,
        ].filter(Boolean));
        saveBlob(blob, `parvsetu-pass-${i + 1}-of-${total}-${p.tokenCode}.png`);
        // Browsers drop rapid-fire downloads; space them out a little.
        if (i < total - 1) await sleep(350);
      }
      setMsg(`Saved ${total} images. If only one appeared, allow multiple downloads for this site.`);
    } catch {
      setMsg('Could not create the images. Try Print instead.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <style>{`@media print { .pass-slide { break-after: page; page-break-after: always; } .pass-slide:last-child { break-after: auto; page-break-after: auto; } }`}</style>

      <div className="no-print grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => void downloadAll()} loading={busy}>
          {!busy && <Download aria-hidden className="h-5 w-5" />} Download all
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer aria-hidden className="h-5 w-5" /> Print all
        </Button>
      </div>
      {msg && (
        <p className="no-print text-center text-sm text-slate-600" role="status">
          {msg}
        </p>
      )}

      <div className="no-print flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(active - 1)}
          disabled={active === 0}
          aria-label="Previous pass"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-200 bg-white text-slate-700 disabled:opacity-30"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-bold text-slate-800" aria-live="polite">
            Pass {active + 1} of {total}
          </span>
          <div className="flex gap-1.5" aria-hidden>
            {passes.map((p, i) => (
              <span key={p.tokenCode} className={cx('h-2 rounded-full transition-all', i === active ? 'w-5 bg-orange-500' : 'w-2 bg-orange-200')} />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => go(active + 1)}
          disabled={active === total - 1}
          aria-label="Next pass"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-orange-200 bg-white text-slate-700 disabled:opacity-30"
        >
          <ChevronRight aria-hidden className="h-5 w-5" />
        </button>
      </div>

      <div
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label={`${total} passes`}
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] print:mx-0 print:block print:overflow-visible print:px-0"
      >
        {passes.map((p, i) => (
          <div
            key={p.tokenCode}
            role="group"
            aria-roledescription="slide"
            aria-label={`Pass ${i + 1} of ${total}`}
            className="pass-slide flex w-[86%] max-w-[420px] shrink-0 snap-center flex-col gap-3 print:mx-auto print:w-auto"
          >
            <PassCard order={order} pass={p} index={i} total={total} />
            <PassActions order={order} pass={p} index={i} total={total} showPrint={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
