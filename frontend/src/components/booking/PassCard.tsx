'use client';

import { PassSponsors } from '@/components/SponsorStrip';
import { hasVenue, VenueLines } from '@/components/VenueDetails';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarClock, Download, IndianRupee, MapPin, Printer, Share2, User, Users } from 'lucide-react';
import { saveBlob } from '@/lib/api';
import { festivalTheme, gradient } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { isFree } from '@/lib/booking';
import { fmtPassWindowL } from '@/lib/i18n/format';
import type { MessageKey } from '@/lib/i18n/core';
import { useT, type I18n } from '@/lib/i18n/provider';
import type { Pass, PassOrder, PassStatus } from '@/lib/booking-types';
import { FestivalArt, Mandala, Toran } from '../FestivalArt';
import { QrImage, qrCardPng } from '../QrImage';
import { Badge, Button, cx } from '../ui';
import { apiImageSrc } from '@/lib/media';

const statusText = (i: I18n, s: PassStatus) => (i.has(`passStatus.${s}`) ? i.t(`passStatus.${s}` as MessageKey) : s);
const admitsText = (i: I18n, n: number) => i.tp('common.people', n);

/**
 * One ticket: festival-coloured header, big QR, validity and details. An order
 * may carry several (one QR per person) — pass `index`/`total` to label them.
 */
export function PassCard({ order, pass, index = 0, total = 1 }: { order: PassOrder; pass: Pass; index?: number; total?: number }) {
  const th = festivalTheme(order.event.festivalType);
  const tz = order.event.timezone;
  const admits = pass.admits ?? (total > 1 ? 1 : order.visitorCount);
  const dim = pass.status === 'USED' || pass.status === 'EXPIRED' || pass.status === 'CANCELLED';
  const i18n = useT();
  const { t } = i18n;
  return (
    <article
      aria-label={t('passCard.aria', { code: pass.tokenCode })}
      className="pass-ticket pass-print print-break-inside-avoid overflow-hidden rounded-[28px] border-2 bg-white shadow-xl shadow-orange-900/10"
      style={{ borderColor: th.via }}
    >
      <header className="relative overflow-hidden px-5 pb-5 pt-8 text-white" style={{ background: gradient(th) }}>
        <Toran className="absolute inset-x-0 top-0 w-full" />
        <Mandala className="pointer-events-none absolute -right-12 -top-10 h-44 w-44 text-white/20" />
        <div className="relative flex items-center gap-3">
          <span className="h-16 w-16 shrink-0 rounded-full bg-white p-2 shadow-md ring-4 ring-white/30">
            <FestivalArt type={order.event.festivalType} className="h-full w-full" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/85">{t('passCard.entryPass')}</p>
            <h2 className="text-xl font-extrabold leading-tight drop-shadow-sm">{order.event.name}</h2>
            <p className="flex min-w-0 items-center gap-1.5 text-sm text-white/90">
              {apiImageSrc(order.event.organization.logoUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apiImageSrc(order.event.organization.logoUrl)!} alt="" className="h-6 w-6 shrink-0 rounded-full bg-white object-contain p-0.5" />
              )}
              <span className="truncate">{order.event.organization.name}</span>
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-col items-center gap-2 px-5 pb-2 pt-5">
        {total > 1 && (
          <p className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: th.soft, color: th.ink }}>
            {t('passCard.passOf', { i: index + 1, n: total, admits })}
          </p>
        )}
        <div className={cx('relative rounded-2xl border border-slate-200 bg-white p-2', dim && 'opacity-40 grayscale')}>
          <QrImage payload={pass.qrPayload} size={280} alt={`QR code for pass ${pass.tokenCode}`} />
        </div>
        <p className="font-mono text-2xl font-bold tracking-[0.12em]" style={{ color: th.ink }}>
          {pass.tokenCode}
        </p>
        <Badge value={pass.status} className="text-sm">
          {statusText(i18n, pass.status)}
        </Badge>
      </div>

      {/* perforation */}
      <div aria-hidden className="relative my-3 flex items-center">
        <span className="-ml-3 h-6 w-6 rounded-full border-2 bg-[#fffaf3]" style={{ borderColor: th.via }} />
        <span className="mx-2 flex-1 border-t-2 border-dashed border-slate-200" />
        <span className="-mr-3 h-6 w-6 rounded-full border-2 bg-[#fffaf3]" style={{ borderColor: th.via }} />
      </div>

      <dl className="grid gap-3 px-5 pb-5 text-sm">
        {order.timeSlot && (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('passCard.timeSlot')}</dt>
            <dd className="text-lg font-bold text-slate-900">{order.timeSlot.label}</dd>
          </div>
        )}
        <Row icon={CalendarClock} label={t('passCard.valid')}>
          {fmtPassWindowL(order.validFrom, order.validUntil, tz, i18n.locale)}
        </Row>
        <Row icon={Users} label={t('passCard.admits')}>
          <span className="font-bold">{admitsText(i18n, admits)}</span>
          {total > 1 && <span className="text-slate-500"> · {t('passCard.groupOf', { n: order.visitorCount })}</span>}
        </Row>
        <Row icon={User} label={t('passCard.name')}>
          {order.buyerName}
        </Row>
        {hasVenue(order.event.venue) ? (
          <Row icon={MapPin} label={t('passCard.venue')}>
            <VenueLines venue={order.event.venue} />
          </Row>
        ) : (
          order.event.location && (
            <Row icon={MapPin} label={t('passCard.venue')}>
              {order.event.location}
            </Row>
          )
        )}
        <Row icon={IndianRupee} label={total > 1 ? t('passCard.order') : t('passCard.paid')}>
          {isFree(order.amount) ? t('passCard.freePass') : fmtMoney(order.amount, order.currency)}
          {order.payment.demo && <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{t('passCard.demo')}</span>}
        </Row>
      </dl>
        <div className="px-5 pb-1">
          <PassSponsors sponsors={order.printedSponsors} partners={order.printedPartners} />
        </div>
      <p className="border-t border-dashed border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-600">
        {t('passCard.showAtGate')}
      </p>
    </article>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Users; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <dt className="w-20 shrink-0 text-slate-500 [overflow-wrap:anywhere]">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-slate-900">{children}</dd>
    </div>
  );
}

export function PassActions({ order, pass, index = 0, total = 1, showPrint = true }: { order: PassOrder; pass: Pass; index?: number; total?: number; showPrint?: boolean }) {
  const [canShare, setCanShare] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<'share' | 'download' | null>(null);
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const tz = order.event.timezone;
  const i18n = useT();
  const { t } = i18n;
  async function makeFile(): Promise<File> {
    const admits = pass.admits ?? (total > 1 ? 1 : order.visitorCount);
    const blob = await qrCardPng(pass.qrPayload, [
      pass.tokenCode,
      order.event.name,
      order.timeSlot?.label ?? '',
      fmtPassWindowL(order.validFrom, order.validUntil, tz, i18n.locale),
      `${t('passCard.pngAdmits', { admits: admitsText(i18n, admits) })}${total > 1 ? ` · ${t('passCard.pngPassOf', { i: index + 1, n: total })}` : ''}`,
    ].filter(Boolean));
    return new File([blob], `parvsetu-pass-${pass.tokenCode}.png`, { type: 'image/png' });
  }

  async function download() {
    setMsg(null);
    setBusy('download');
    try {
      const f = await makeFile();
      saveBlob(f, f.name);
    } catch {
      setMsg(t('passCard.imgFailed'));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setMsg(null);
    setBusy('share');
    try {
      const url = window.location.href;
      const file = await makeFile().catch(() => null);
      const text = t('passCard.shareText', { event: order.event.name, code: pass.tokenCode });
      const withFile: ShareData = file ? { files: [file], title: order.event.name, text } : { title: order.event.name, text, url };
      if (file && navigator.canShare && !navigator.canShare(withFile)) await navigator.share({ title: order.event.name, text, url });
      else await navigator.share(withFile);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setMsg(t('passCard.shareFailed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print flex flex-col gap-2">
      <Button variant="primary" onClick={download} loading={busy === 'download'} className="w-full">
        {busy !== 'download' && <Download aria-hidden className="h-5 w-5" />} {t('passCard.downloadPng')}
      </Button>
      <div className={cx('grid gap-2', canShare && showPrint ? 'grid-cols-2' : 'grid-cols-1', !canShare && !showPrint && 'hidden')}>
        {canShare && (
          <Button variant="secondary" onClick={share} loading={busy === 'share'}>
            {busy !== 'share' && <Share2 aria-hidden className="h-5 w-5" />} {t('common.share')}
          </Button>
        )}
        {showPrint && (
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer aria-hidden className="h-5 w-5" /> {t('common.print')}
          </Button>
        )}
      </div>
      {msg && (
        <p role="alert" className="text-center text-sm text-red-700">
          {msg}
        </p>
      )}
    </div>
  );
}
