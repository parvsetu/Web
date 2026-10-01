'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CircleX, Clock3, Hourglass, LinkIcon, RotateCcw, Ticket, TicketPlus, Wallet } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { PassActions, PassCard } from '@/components/booking/PassCard';
import { Alert, Button, Empty, Skeleton, Spinner } from '@/components/ui';
import { fmtMoney } from '@/lib/format';
import { BookingError, booking, bookingErrorMessage, demoPayHref, fmtPassTime, savePass } from '@/lib/booking';
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

  const load = useCallback(async () => {
    try {
      const o = await booking.order(orderId, k);
      setOrder(o);
      setError(null);
      savePass({ orderId: o.id, accessKey: k, eventName: o.event.name, createdAt: o.createdAt });
    } catch (e) {
      setError(e instanceof BookingError ? e : new BookingError(0, bookingErrorMessage(e)));
    }
  }, [orderId, k]);

  useEffect(() => {
    if (k) void load();
  }, [k, load]);

  // Wait for payment confirmation (PENDING, or PAID before the pass is minted).
  const waiting = !!order && (order.status === 'PENDING' || (order.status === 'PAID' && !order.pass));
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
      <Empty title="This pass link is incomplete" icon={LinkIcon}>
        Open the full link you got after booking, or find it under My passes on the phone you booked with.
        <FooterLinks />
      </Empty>
    );
  }

  if (error && !order) {
    return error.status === 404 ? (
      <Empty title="Pass not found" icon={Ticket}>
        This link doesn’t match any booking. Check that you copied the whole link.
        <FooterLinks />
      </Empty>
    ) : (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{error.message}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RotateCcw aria-hidden className="h-4 w-4" /> Retry
          </Button>
        </div>
      </Alert>
    );
  }

  if (!order) return <PassSkeleton />;

  const bookAgain = `/book/${order.event.id}`;

  if (order.status === 'PAID' && order.pass) {
    const o = order as PassOrder & { pass: NonNullable<PassOrder['pass']> };
    return (
      <div className="flex flex-col gap-4">
        <style>{`@media print { .pass-ticket { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; max-width: 420px; margin: 0 auto; } }`}</style>
        <div className="no-print text-center">
          <h1 className="text-2xl font-extrabold text-slate-900">Your pass is ready</h1>
          <p className="text-sm text-slate-600">Keep this page or download the image — you’ll need the QR at the gate.</p>
        </div>
        {error && (
          <div className="no-print">
            <Alert kind="warning">Couldn’t refresh the pass status just now. Showing the last known details.</Alert>
          </div>
        )}
        <PassCard order={o} />
        <PassActions order={o} />
        <div className="no-print flex flex-col gap-2 pt-2 text-center text-sm">
          <p className="text-slate-500">Saved under My passes on this phone. Bookmark this page to open it anywhere.</p>
          <div className="flex justify-center gap-4 font-semibold">
            <Link href="/book/my-passes" className="text-orange-700 hover:underline">
              My passes
            </Link>
            <Link href={bookAgain} className="text-orange-700 hover:underline">
              Book another pass
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
          <h1 className="text-xl font-extrabold text-slate-900">Waiting for payment</h1>
          <p className="mt-1 text-slate-600">
            {order.event.name} · {order.timeSlot?.label} · {order.visitorCount === 1 ? '1 person' : `${order.visitorCount} people`}
          </p>
          {order.status === 'PENDING' && (
            <p className="mt-1 text-sm text-slate-500">
              Amount {fmtMoney(order.amount, order.currency)} · places held until {fmtPassTime(order.expiresAt, order.event.timezone)}
            </p>
          )}
        </div>
        <p className="inline-flex items-center justify-center gap-2 text-sm text-slate-500" aria-live="polite">
          <Spinner className="text-amber-500" /> Checking automatically…
        </p>
        {order.status === 'PENDING' && order.payment.demo && (
          <Link
            href={demoPayHref(order.id, k)}
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
          >
            <Wallet aria-hidden className="h-5 w-5" /> Complete payment
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
        <h1 className="text-xl font-extrabold text-slate-900">{failed ? 'Payment didn’t go through' : 'This booking expired'}</h1>
        <p className="mt-1 text-slate-600">
          {failed
            ? 'No pass was issued and nothing was charged. You can book again — places are released back for everyone.'
            : `Payment wasn’t completed within the hold time, so the places were released. No pass was issued.`}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {order.event.name} · {order.timeSlot?.label}
        </p>
      </div>
      <Link
        href={bookAgain}
        className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-5 font-semibold text-white shadow-md"
      >
        <TicketPlus aria-hidden className="h-5 w-5" /> Book again
      </Link>
    </div>
  );
}

function FooterLinks() {
  return (
    <div className="mt-4 flex justify-center gap-4 font-semibold">
      <Link href="/book/my-passes" className="text-orange-700 hover:underline">
        My passes
      </Link>
      <Link href="/book" className="text-orange-700 hover:underline">
        Browse festivals
      </Link>
    </div>
  );
}

function PassSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading pass">
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
