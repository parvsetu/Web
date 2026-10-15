'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, RotateCcw, Smartphone, Ticket, Trash2 } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Badge, Empty, Skeleton } from '@/components/ui';
import { festivalTheme } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { BookingError, booking, demoPayHref, isFree, loadSavedPasses, orderPasses, passHref, removeSavedPass } from '@/lib/booking';
import { fmtPassWindowL } from '@/lib/i18n/format';
import type { MessageKey } from '@/lib/i18n/core';
import { useT, type I18n } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';
import type { PassOrder, SavedPass } from '@/lib/booking-types';

type Live = { state: 'loading' } | { state: 'ok'; order: PassOrder } | { state: 'gone' } | { state: 'error'; message: string };

export default function MyPassesPage() {
  const [saved, setSaved] = useState<SavedPass[] | null>(null);
  const [live, setLive] = useState<Record<string, Live>>({});
  const { t } = useT();
  const errText = useBookingErrorText();

  const fetchOne = useCallback(async (p: SavedPass) => {
    setLive((m) => ({ ...m, [p.orderId]: { state: 'loading' } }));
    try {
      const order = await booking.order(p.orderId, p.accessKey);
      setLive((m) => ({ ...m, [p.orderId]: { state: 'ok', order } }));
    } catch (e) {
      const gone = e instanceof BookingError && e.status === 404;
      setLive((m) => ({ ...m, [p.orderId]: gone ? { state: 'gone' } : { state: 'error', message: errText(e) } }));
    }
  }, [errText]);

  useEffect(() => {
    const list = loadSavedPasses();
    setSaved(list);
    list.forEach((p) => void fetchOne(p));
  }, [fetchOne]);

  function remove(p: SavedPass) {
    if (!window.confirm(t('myPasses.confirmRemove', { event: p.eventName }))) return;
    removeSavedPass(p.orderId);
    setSaved((s) => (s ? s.filter((x) => x.orderId !== p.orderId) : s));
  }

  return (
    <PublicShell>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">{t('common.myPasses')}</h1>
          <p className="mt-1 flex items-start gap-2 text-sm text-slate-600">
            <Smartphone aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            {t('myPasses.intro')}
          </p>
        </div>

        {saved === null ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label={t('myPasses.loading')}>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        ) : saved.length === 0 ? (
          <Empty title={t('myPasses.empty')} icon={Ticket}>
            {t('myPasses.emptyHint')}
            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
              >
                <Ticket aria-hidden className="h-5 w-5" /> {t('myPasses.bookPass')}
              </Link>
            </div>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {saved.map((p) => (
              <li key={p.orderId}>
                <PassRow saved={p} live={live[p.orderId] ?? { state: 'loading' }} onRemove={() => remove(p)} onRetry={() => void fetchOne(p)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}

function statusOf(i: I18n, o: PassOrder): { value: string; text: string } {
  const passes = orderPasses(o);
  const look = (k: string, fallback: string) => (i.has(k) ? i.t(k as MessageKey) : fallback);
  if (o.status === 'PAID' && passes.length) {
    const used = passes.filter((p) => p.status === 'USED').length;
    if (passes.length > 1 && used > 0 && used < passes.length) return { value: 'ACTIVE', text: i.t('myPasses.usedOf', { used, n: passes.length }) };
    const s = passes[0].status;
    return { value: s, text: look(`myPasses.st.${s}`, s) };
  }
  return { value: o.status, text: look(`myPasses.order.${o.status}`, o.status) };
}

function PassRow({ saved, live, onRemove, onRetry }: { saved: SavedPass; live: Live; onRemove: () => void; onRetry: () => void }) {
  const order = live.state === 'ok' ? live.order : null;
  const th = festivalTheme(order?.event.festivalType);
  const href = order?.status === 'PENDING' && order.payment.demo ? demoPayHref(saved.orderId, saved.accessKey) : passHref(saved.orderId, saved.accessKey);
  const i18n = useT();
  const { t, tp } = i18n;
  const st = order ? statusOf(i18n, order) : null;
  return (
    <div className="flex items-stretch overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
      <span aria-hidden className="w-1.5 shrink-0" style={{ background: order ? th.via : '#fed7aa' }} />
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 p-3 hover:bg-orange-50/50 focus:outline-none focus-visible:bg-orange-50">
        <FestivalBadge type={order?.event.festivalType} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900">{order?.event.name ?? saved.eventName}</p>
          {live.state === 'loading' && <Skeleton className="mt-1 h-4 w-40" />}
          {order && (
            <>
              <p className="truncate text-sm text-slate-600">
                {order.timeSlot?.label} · {fmtPassWindowL(order.validFrom, order.validUntil, order.event.timezone, i18n.locale)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {st && <Badge value={st.value}>{st.text}</Badge>}
                <span>{tp('common.people', order.visitorCount)}</span>
                <span>· {isFree(order.amount) ? t('common.free') : fmtMoney(order.amount, order.currency)}</span>
                {orderPasses(order).length > 0 && (
                  <span className="font-semibold">
                    · {tp('myPasses.qr', orderPasses(order).length)}
                  </span>
                )}
              </div>
            </>
          )}
          {live.state === 'gone' && <p className="text-sm text-slate-500">{t('myPasses.gone')}</p>}
          {live.state === 'error' && (
            <p className="text-sm text-red-700" role="alert">
              {live.message}
            </p>
          )}
        </div>
        <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-slate-400" />
      </Link>
      <div className="flex shrink-0 flex-col border-l border-orange-50">
        {live.state === 'error' && (
          <button type="button" onClick={onRetry} aria-label={t('myPasses.retry', { event: saved.eventName })} className="flex min-h-[48px] w-12 flex-1 items-center justify-center text-slate-500 hover:bg-orange-50">
            <RotateCcw aria-hidden className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('myPasses.remove', { event: saved.eventName })}
          className="flex min-h-[48px] w-12 flex-1 items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 aria-hidden className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

