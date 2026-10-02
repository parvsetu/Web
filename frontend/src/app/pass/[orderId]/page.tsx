'use client';

import { VenueCard } from '@/components/VenueDetails';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CircleX, Clock3, FileDown, Hourglass, LinkIcon, RotateCcw, Ticket, TicketPlus, Wallet } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { PassActions, PassCard } from '@/components/booking/PassCard';
import { PassCarousel } from '@/components/booking/PassCarousel';
import { SponsorStrip, type SponsorPublic } from '@/components/SponsorStrip';
import { PrintFormatPicker, PrintFormatStyle, type PrintFormat } from '@/components/PrintFormat';
import { Alert, Button, Empty, Skeleton, Spinner } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { BookingError, booking, demoPayHref, orderPasses, savePass } from '@/lib/booking';
import { fmtPassTimeL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { useBookingErrorText } from '@/lib/i18n/errors';
import type { PassOrder } from '@/lib/booking-types';

const POLL_MS = 4000;

export default function PassPage() {
  return (
    <PublicShell>
      <Suspense fallback={<PassSkeleton />}>
        <PassView />
      </Suspense>
    </PublicShell>
  );
}

function PassView() {
  const { orderId } = useParams<{ orderId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const [order, setOrder] = useState<PassOrder | null>(null);
  const [error, setError] = useState<BookingError | null>(null);
  const { t, tp, locale } = useT();
  const errText = useBookingErrorText();

  const load = useCallback(async () => {
    try {
      const o = await booking.order(orderId, k);
      setOrder(o);
      setError(null);
      savePass({ orderId: o.id, accessKey: k, eventName: o.event.name, createdAt: o.createdAt });
    } catch (e) {
      setError(e instanceof BookingError ? e : new BookingError(0, errText(e)));
    }
  }, [orderId, k, errText]);

  useEffect(() => {
    if (k) void load();
  }, [k, load]);

  // Wait for payment confirmation (PENDING, or PAID before the pass is minted).
  const waiting = !!order && (order.status === 'PENDING' || (order.status === 'PAID' && orderPasses(order).length === 0));
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [waiting, load]);

  // Refresh the live status (e.g. USED) when the visitor comes back to the tab.
  useEffect(() => {
    if (!k) return;
    const onVis = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [k, load]);

  if (!k) {
    return (
      <Empty title={t('pass.incomplete')} icon={LinkIcon}>
        {t('pass.incompleteHint')}
        <FooterLinks />
      </Empty>
    );
  }

  if (error && !order) {
    return error.status === 404 ? (
      <Empty title={t('pass.notFound')} icon={Ticket}>
        {t('pass.notFoundHint')}
        <FooterLinks />
      </Empty>
    ) : (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{errText(error)}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RotateCcw aria-hidden className="h-4 w-4" /> {t('common.retry')}
          </Button>
        </div>
      </Alert>
    );
  }

  if (!order) return <PassSkeleton />;

  const bookAgain = `/book/${order.event.id}`;

  const passes = orderPasses(order);
  if (order.status === 'PAID' && passes.length > 0) {
    const multi = passes.length > 1;
    return (
      <div className="flex flex-col gap-4">
        <style>{`@media print { .pass-ticket { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; max-width: 420px; margin: 0 auto 8mm; } }`}</style>
        <div className="no-print text-center">
          <h1 className="text-2xl font-extrabold text-slate-900">{multi ? t('pass.readyMany', { n: passes.length }) : t('pass.ready')}</h1>
          <p className="text-sm text-slate-600">
            {multi ? t('pass.readyManyHint') : t('pass.readyHint')}
          </p>
        </div>
        {error && (
          <div className="no-print">
            <Alert kind="warning">{t('pass.refreshFailed')}</Alert>
          </div>
        )}
        {multi ? (
          <PassCarousel order={order} passes={passes} />
        ) : (
          <>
            <PassCard order={order} pass={passes[0]} />
            <PassActions order={order} pass={passes[0]} />
          </>
        )}
        <VenueCard venue={order.event.venue} className="no-print" />
        <OrderSponsors eventId={order.event.id} />
        <TaxInvoice order={order} />
        <PrintChooser initial={order.printFormat ?? 'THERMAL_80'} ads={(order.printedSponsors?.length ?? 0) + (order.printedPartners?.length ?? 0)} />
        <div className="no-print flex flex-col gap-2 pt-2 text-center text-sm">
          <p className="text-slate-500">{t('pass.savedNote')}</p>
          <div className="flex justify-center gap-4 font-semibold">
            <Link href="/book/my-passes" className="text-orange-700 hover:underline">
              {t('common.myPasses')}
            </Link>
            <Link href={bookAgain} className="text-orange-700 hover:underline">
              {t('pass.bookAnother')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (waiting) {
    return (
      <div className="flex flex-col gap-4 rounded-3xl border border-amber-200 bg-white p-6 text-center shadow-sm">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Hourglass aria-hidden className="h-8 w-8" />
        </span>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{t('pass.waiting')}</h1>
          <p className="mt-1 text-slate-600">
            {order.event.name} · {order.timeSlot?.label} · {tp('common.people', order.visitorCount)}
          </p>
          {order.status === 'PENDING' && (
            <p className="mt-1 text-sm text-slate-500">
              {t('pass.amountHeld', { amount: fmtMoney(order.amount, order.currency), time: fmtPassTimeL(order.expiresAt, order.event.timezone, locale) })}
            </p>
          )}
        </div>
        <p className="inline-flex items-center justify-center gap-2 text-sm text-slate-500" aria-live="polite">
          <Spinner className="text-amber-500" /> {t('pass.checking')}
        </p>
        {order.status === 'PENDING' && order.payment.demo && (
          <Link
            href={demoPayHref(order.id, k)}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
          >
            <Wallet aria-hidden className="h-5 w-5" /> {t('pass.completePayment')}
          </Link>
        )}
      </div>
    );
  }

  // FAILED / EXPIRED
  const failed = order.status === 'FAILED';
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
        {failed ? <CircleX aria-hidden className="h-8 w-8" /> : <Clock3 aria-hidden className="h-8 w-8" />}
      </span>
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">{failed ? t('pass.failed') : t('pass.expired')}</h1>
        <p className="mt-1 text-slate-600">
          {failed ? t('pass.failedHint') : t('pass.expiredHint')}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {order.event.name} · {order.timeSlot?.label}
        </p>
      </div>
      <Link
        href={bookAgain}
        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
      >
        <TicketPlus aria-hidden className="h-5 w-5" /> {t('pass.bookAgain')}
      </Link>
    </div>
  );
}

/** Invoice / tax-invoice details for a paid order (GST split when charged). */
function TaxInvoice({ order }: { order: PassOrder }) {
  const { t } = useT();
  if (!order.invoiceNo) return null;
  const g = order.gst;
  return (
    <section className="rounded-2xl border border-orange-100 bg-white p-4 text-sm shadow-sm">
      <h2 className="mb-2 font-bold">{g ? t('pass.taxInvoice') : t('pass.invoice')} · {order.invoiceNo}</h2>
      {order.issuer && (
        <p className="text-slate-600">
          {order.issuer.legalName}
          {order.issuer.gstin ? ` · GSTIN ${order.issuer.gstin}` : ''}
          <br />
          {order.issuer.address}
        </p>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-y-1">
        {g ? (
          <>
            <dt className="text-slate-500">{t('pass.taxable', { sac: g.sac })}</dt><dd className="text-right">{fmtMoney(g.taxable)}</dd>
            <dt className="text-slate-500">CGST {g.ratePercent / 2}%</dt><dd className="text-right">{fmtMoney(g.cgst)}</dd>
            <dt className="text-slate-500">SGST {g.ratePercent / 2}%</dt><dd className="text-right">{fmtMoney(g.sgst)}</dd>
          </>
        ) : null}
        <dt className="font-semibold">{t('pass.totalPaid')}</dt><dd className="text-right font-bold">{fmtMoney(order.amount)}</dd>
      </dl>
    </section>
  );
}

/** Defaults to the layout the platform chose for this pass; A4 with several ads also offers "Save as PDF". */
function PrintChooser({ initial, ads }: { initial: PrintFormat; ads: number }) {
  const [format, setFormat] = useState<PrintFormat>(initial);
  const { t } = useT();
  return (
    <div className="no-print flex flex-col gap-2 rounded-2xl border border-orange-100 bg-white p-3">
      <PrintFormatStyle format={format} />
      <p className="text-sm font-semibold text-slate-700">{t('pass.printFormat')}</p>
      <PrintFormatPicker value={format} onChange={setFormat} />
      {format === 'A4' && ads >= 2 && (
        <Button variant="secondary" onClick={() => window.print()}>
          <FileDown aria-hidden className="h-5 w-5" /> {t('pass.savePdf')}
        </Button>
      )}
      {format === 'A4' && ads >= 2 && <p className="text-xs text-slate-500">{t('pass.a4Note')}</p>}
    </div>
  );
}

function OrderSponsors({ eventId }: { eventId: string }) {
  const [list, setList] = useState<SponsorPublic[] | null>(null);
  const { t } = useT();
  useEffect(() => {
    booking.sponsors(eventId).then(setList).catch(() => setList(null));
  }, [eventId]);
  return <SponsorStrip sponsors={list} title={t('pass.festivalPartners')} />;
}

function FooterLinks() {
  const { t } = useT();
  return (
    <div className="mt-4 flex justify-center gap-4 font-semibold">
      <Link href="/book/my-passes" className="text-orange-700 hover:underline">
        {t('common.myPasses')}
      </Link>
      <Link href="/" className="text-orange-700 hover:underline">
        {t('common.browseFestivals')}
      </Link>
    </div>
  );
}

function PassSkeleton() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('pass.loading')}>
      <Skeleton className="mx-auto h-8 w-48" />
      <div className="overflow-hidden rounded-[28px] border border-orange-100 bg-white">
        <Skeleton className="h-28 rounded-none" />
        <div className="flex flex-col items-center gap-3 p-5">
          <Skeleton className="h-64 w-64" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
