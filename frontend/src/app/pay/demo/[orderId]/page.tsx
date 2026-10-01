'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, CircleX, Clock3, CreditCard, LinkIcon, Lock, RotateCcw, Smartphone, TicketPlus, Timer, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { PublicShell } from '@/components/booking/PublicShell';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Alert, Button, Empty, Skeleton, cx } from '@/components/ui';
import { festivalTheme } from '@/lib/festival-theme';
import { fmtMoney } from '@/lib/format';
import { BookingError, booking, bookingErrorMessage, fmtPassWindow, passHref } from '@/lib/booking';
import type { PassOrder } from '@/lib/booking-types';

type Method = 'upi' | 'card' | 'netbanking';
const METHODS: { key: Method; label: string; sub: string; icon: LucideIcon }[] = [
  { key: 'upi', label: 'UPI', sub: 'GPay, PhonePe, Paytm', icon: Smartphone },
  { key: 'card', label: 'Card', sub: 'Debit or credit', icon: CreditCard },
  { key: 'netbanking', label: 'Net banking', sub: 'All major banks', icon: Building2 },
];

export default function DemoPayPage() {
  return (
    <PublicShell>
      <Suspense fallback={<PaySkeleton />}>
        <DemoCheckout />
      </Suspense>
    </PublicShell>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  if (!until) return null;
  return Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000));
}

function DemoCheckout() {
  const { orderId } = useParams<{ orderId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const router = useRouter();
  const [order, setOrder] = useState<PassOrder | null>(null);
  const [loadError, setLoadError] = useState<BookingError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'success' | 'fail' | null>(null);
  const [method, setMethod] = useState<Method>('upi');
  const redirected = useRef(false);

  const load = useCallback(async () => {
    try {
      const o = await booking.order(orderId, k);
      setOrder(o);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof BookingError ? e : new BookingError(0, bookingErrorMessage(e)));
    }
  }, [orderId, k]);

  useEffect(() => {
    if (k) void load();
  }, [k, load]);

  // Already paid (e.g. back button after paying) → straight to the pass.
  useEffect(() => {
    if (order?.status === 'PAID' && !redirected.current) {
      redirected.current = true;
      router.replace(passHref(order.id, k));
    }
  }, [order, k, router]);

  const left = useCountdown(order?.status === 'PENDING' ? order.expiresAt : null);
  // When the hold runs out, ask the server (it decides EXPIRED, not us).
  useEffect(() => {
    if (left === 0) void load();
  }, [left, load]);

  async function pay(outcome: 'success' | 'fail') {
    if (busy) return;
    setBusy(outcome);
    setActionError(null);
    try {
      const o = await booking.demoPay(orderId, k, outcome);
      setOrder(o);
      if (o.status === 'PAID') {
        redirected.current = true;
        router.replace(passHref(o.id, k));
        return;
      }
    } catch (e) {
      const err = e instanceof BookingError ? e : null;
      if (err?.code === 'ORDER_EXPIRED' || err?.code === 'ORDER_CLOSED') await load();
      else if (err?.status === 409) {
        // e.g. the slot filled up in the meantime
        setActionError(err.message);
        await load();
      } else setActionError(bookingErrorMessage(e));
    }
    setBusy(null);
  }

  if (!k) {
    return (
      <Empty title="This payment link is incomplete" icon={LinkIcon}>
        Please go back and book again.
        <div className="mt-4">
          <Link href="/book" className="font-semibold text-orange-700 hover:underline">
            Browse festivals
          </Link>
        </div>
      </Empty>
    );
  }
  if (loadError && !order) {
    return loadError.status === 404 ? (
      <Empty title="Booking not found" icon={XCircle}>
        This payment link doesn’t match a booking, or demo payments are switched off.
        <div className="mt-4">
          <Link href="/book" className="font-semibold text-orange-700 hover:underline">
            Browse festivals
          </Link>
        </div>
      </Empty>
    ) : (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{loadError.message}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RotateCcw aria-hidden className="h-4 w-4" /> Retry
          </Button>
        </div>
      </Alert>
    );
  }
  if (!order || order.status === 'PAID') return <PaySkeleton />;

  const t = festivalTheme(order.event.festivalType);
  const bookAgain = `/book/${order.event.id}`;

  if (order.status === 'FAILED' || order.status === 'EXPIRED') {
    const failed = order.status === 'FAILED';
    return (
      <div className="flex flex-col gap-4">
        <DemoBanner />
        <div className="flex flex-col gap-4 rounded-3xl border border-red-100 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            {failed ? <CircleX aria-hidden className="h-8 w-8" /> : <Clock3 aria-hidden className="h-8 w-8" />}
          </span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{failed ? 'Payment failed' : 'Time’s up — booking expired'}</h1>
            <p className="mt-1 text-slate-600">
              {failed
                ? 'The (demo) payment didn’t go through. No money was taken and no pass was issued.'
                : 'Payment wasn’t completed within the hold time, so your places were released.'}
            </p>
          </div>
          <Link
            href={bookAgain}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
          >
            <TicketPlus aria-hidden className="h-5 w-5" /> Try again
          </Link>
        </div>
      </div>
    );
  }

  const mins = left !== null ? Math.floor(left / 60) : 0;
  const secs = left !== null ? left % 60 : 0;
  const urgent = left !== null && left < 120;

  return (
    <div className="flex flex-col gap-4">
      <DemoBanner />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">Checkout</h1>
        <div
          role="timer"
          aria-label={`Places held for ${mins} minutes ${secs} seconds`}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-base font-bold tabular-nums',
            urgent ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800',
          )}
        >
          <Timer aria-hidden className="h-4 w-4" />
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </div>
      <p className="-mt-2 text-sm text-slate-500">Your places are held until the timer runs out.</p>

      {/* order summary */}
      <section aria-label="Order summary" className="overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 p-4" style={{ background: t.soft }}>
          <FestivalBadge type={order.event.festivalType} className="h-14 w-14 bg-white" />
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{order.event.name}</p>
            <p className="truncate text-sm" style={{ color: t.ink }}>
              {order.event.organization.name}
            </p>
          </div>
        </div>
        <dl className="grid gap-2 p-4 text-sm">
          <SummaryRow label="Slot">{order.timeSlot?.label ?? '—'}</SummaryRow>
          <SummaryRow label="When">{fmtPassWindow(order.validFrom, order.validUntil, order.event.timezone)}</SummaryRow>
          <SummaryRow label="Name">{order.buyerName}</SummaryRow>
          <SummaryRow label="Tickets">
            {order.visitorCount} × {fmtMoney(order.unitPrice, order.currency)}
          </SummaryRow>
          <div className="mt-1 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
            <dt className="text-base font-bold text-slate-900">Total</dt>
            <dd className="text-2xl font-extrabold" style={{ color: t.ink }}>
              {fmtMoney(order.amount, order.currency)}
            </dd>
          </div>
        </dl>
      </section>

      {/* fake methods */}
      <section aria-label="Payment method (demo)">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Pay with</h2>
        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => {
            const sel = method === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={sel}
                onClick={() => setMethod(m.key)}
                className={cx(
                  'flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 text-center transition',
                  sel ? 'border-orange-500 bg-orange-50 shadow-sm' : 'border-slate-200 bg-white hover:border-orange-200',
                )}
              >
                <m.icon aria-hidden className={cx('h-6 w-6', sel ? 'text-orange-600' : 'text-slate-500')} />
                <span className="text-sm font-bold text-slate-900">{m.label}</span>
                <span className="text-[11px] leading-tight text-slate-500">{m.sub}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Demo only — choosing a method changes nothing. No details are collected.</p>
      </section>

      {actionError && <Alert>{actionError}</Alert>}

      <div className="flex flex-col gap-2">
        <Button variant="success" size="lg" onClick={() => void pay('success')} loading={busy === 'success'} disabled={!!busy || left === 0} className="w-full">
          {busy !== 'success' && <Lock aria-hidden className="h-5 w-5" />}
          Pay {fmtMoney(order.amount, order.currency)} (demo)
        </Button>
        <Button variant="ghost" onClick={() => void pay('fail')} loading={busy === 'fail'} disabled={!!busy || left === 0} className="w-full text-red-700">
          {busy !== 'fail' && <XCircle aria-hidden className="h-5 w-5" />}
          Simulate failed payment
        </Button>
      </div>
    </div>
  );
}

function DemoBanner() {
  return (
    <div role="note" className="flex items-start gap-3 rounded-2xl border-2 border-amber-400 bg-amber-100 px-4 py-3 text-amber-950 shadow-sm">
      <AlertTriangle aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
      <div>
        <p className="font-extrabold">Demo payment — no real money is charged</p>
        <p className="text-sm">This is a test checkout. Real online payments aren’t switched on yet.</p>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function PaySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading checkout">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-56 w-full rounded-3xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}
