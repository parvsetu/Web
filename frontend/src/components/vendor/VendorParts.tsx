'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, CreditCard, MapPin, Store, Ticket, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { cx } from '@/lib/cx';
import { STALL_CATEGORY_LABEL, type StallBooking, type StallBookingStatus, type StallTypeInfo } from '@/lib/stall-types';
import { FestivalBadge } from '../FestivalBanner';
import { Alert, Badge, Button, Modal } from '../ui';

export const BOOKING_STATUS: Record<StallBookingStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Awaiting payment', tone: 'PENDING' },
  PAID: { label: 'Confirmed', tone: 'ACTIVE' },
  FAILED: { label: 'Payment failed', tone: 'CANCELLED' },
  EXPIRED: { label: 'Expired', tone: 'EXPIRED' },
};

export function BookingStatusBadge({ status }: { status: StallBookingStatus }) {
  return <Badge value={BOOKING_STATUS[status].tone}>{BOOKING_STATUS[status].label}</Badge>;
}

export const range = (a: string, b: string) => (a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`);

/** Stall type card: what it is, price and how many are left (live). */
export function StallTypeCard({ t, action, className }: { t: StallTypeInfo; action?: React.ReactNode; className?: string }) {
  const soldOut = t.available <= 0;
  const pct = t.totalCount ? Math.round((t.booked / t.totalCount) * 100) : 100;
  return (
    <article className={cx('flex flex-col gap-2 rounded-2xl border bg-white p-4 shadow-sm', soldOut ? 'border-slate-200 opacity-80' : 'border-teal-100', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{t.name}</p>
          <p className="text-xs text-slate-500">{[STALL_CATEGORY_LABEL[t.category], t.size].filter(Boolean).join(' · ')}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-lg font-black text-teal-700">{fmtMoney(t.price)}</span>
          <span className="block text-[11px] text-slate-500">per stall</span>
        </p>
      </div>
      {t.description && <p className="text-sm text-slate-600">{t.description}</p>}
      <div className="flex flex-col gap-1">
        <div className="h-2 overflow-hidden rounded-full bg-teal-50">
          <div className={cx('h-full rounded-full', soldOut ? 'bg-slate-400' : pct > 80 ? 'bg-amber-500' : 'bg-teal-500')} style={{ width: `${pct}%` }} />
        </div>
        <p className={cx('text-xs font-semibold', soldOut ? 'text-slate-500' : t.available <= 3 ? 'text-amber-700' : 'text-teal-700')}>
          {soldOut ? 'Sold out' : `${t.available} of ${t.totalCount} available`} · {t.booked} booked
        </p>
      </div>
      {action}
    </article>
  );
}

/** One of the vendor's bookings. */
export function BookingCard({ b, onPay }: { b: StallBooking; onPay?: () => void }) {
  const open = b.status === 'PENDING' && new Date(b.expiresAt) > new Date();
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><Store aria-hidden className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="truncate font-bold">{b.event.name}</p>
            <p className="truncate text-xs text-slate-500">{b.event.organization.name} · {range(b.event.startDate, b.event.endDate)}</p>
          </div>
        </div>
        <BookingStatusBadge status={b.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Stall</dt><dd className="font-semibold">{b.quantity} × {b.stallType.name}</dd></div>
        <div><dt className="text-xs text-slate-500">Amount</dt><dd className="font-semibold">{fmtMoney(b.amount)}</dd></div>
        <div><dt className="text-xs text-slate-500">Stall no.</dt><dd className="font-semibold">{b.stallNumbers ?? (b.status === 'PAID' ? 'To be assigned' : '—')}</dd></div>
        <div><dt className="text-xs text-slate-500">Invoice</dt><dd className="font-semibold">{b.invoiceNo ?? '—'}</dd></div>
      </dl>
      {b.event.venue.fullAddress && (
        <p className="flex items-start gap-1.5 text-xs text-slate-600">
          <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {b.event.venue.mapUrl ? <a href={b.event.venue.mapUrl} target="_blank" rel="noopener noreferrer" className="underline">{b.event.venue.fullAddress}</a> : b.event.venue.fullAddress}
        </p>
      )}
      {b.mandalNote && <Alert kind="info">Note from the mandal: {b.mandalNote}</Alert>}
      {open && onPay && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <span className="flex items-center gap-1.5"><Clock3 aria-hidden className="h-4 w-4" /> Held until {fmtDateTime(b.expiresAt)} — pay to confirm.</span>
          <Button size="sm" onClick={onPay}><CreditCard aria-hidden className="h-4 w-4" /> Pay {fmtMoney(b.amount)}</Button>
        </div>
      )}
      {b.paidAt && <p className="text-xs text-slate-500">Paid {fmtDateTime(b.paidAt)}{b.paymentReference ? ` · Ref ${b.paymentReference}` : ''}</p>}
    </article>
  );
}

/**
 * Demo checkout for a stall booking: price breakdown, the hold countdown, and
 * pay / simulate failure. The server decides PAID / FAILED / EXPIRED.
 */
export function StallPayModal({ booking, onClose, onDone }: { booking: StallBooking; onClose: () => void; onDone: (b: StallBooking) => void }) {
  const [b, setB] = useState(booking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(() => Math.max(0, new Date(booking.expiresAt).getTime() - Date.now()));

  useEffect(() => {
    if (b.status !== 'PENDING') return;
    const t = setInterval(() => setLeft(Math.max(0, new Date(b.expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [b.status, b.expiresAt]);

  async function pay(outcome: 'success' | 'fail') {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<StallBooking>(`/vendor/bookings/${b.id}/demo-pay`, { outcome });
      setB(r);
      onDone(r);
    } catch (e) {
      setError(errorMessage(e));
      api.get<StallBooking>(`/vendor/bookings/${b.id}`).then((r) => { setB(r); onDone(r); }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  const mm = Math.floor(left / 60000);
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  return (
    <Modal open onClose={onClose} title={b.status === 'PAID' ? 'Stall booked' : 'Pay for your stall'}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-2xl bg-teal-50 p-3">
          <FestivalBadge type="DEFAULT" className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate font-bold">{b.event.name}</p>
            <p className="text-xs text-slate-600"><CalendarDays aria-hidden className="mr-1 inline h-3.5 w-3.5" />{range(b.event.startDate, b.event.endDate)}</p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-slate-500">{b.quantity} × {b.stallType.name}</dt><dd className="text-right">{fmtMoney(b.base)}</dd>
          {Number(b.gst) > 0 && (<><dt className="text-slate-500">GST {b.gstPercent}%</dt><dd className="text-right">{fmtMoney(b.gst)}</dd></>)}
          <dt className="font-bold">Total</dt><dd className="text-right text-lg font-black">{fmtMoney(b.amount)}</dd>
        </dl>
        {b.status === 'PAID' ? (
          <>
            <Alert kind="success">
              <span className="flex items-center gap-1.5"><CheckCircle2 aria-hidden className="h-4 w-4" /> Confirmed{b.invoiceNo ? ` · Invoice ${b.invoiceNo}` : ''}. The mandal will assign your stall number.</span>
            </Alert>
            <Button onClick={onClose}><Ticket aria-hidden className="h-4 w-4" /> See my bookings</Button>
          </>
        ) : b.status === 'PENDING' && left > 0 ? (
          <>
            <p className="text-center text-sm text-slate-600"><Clock3 aria-hidden className="mr-1 inline h-4 w-4" />Stalls held for you for <strong>{mm}:{ss}</strong></p>
            {b.paymentProvider === 'demo' && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo payment — no real money is charged.</div>}
            <Button variant="success" size="lg" loading={busy} onClick={() => void pay('success')}>
              <CreditCard aria-hidden className="h-5 w-5" /> Pay {fmtMoney(b.amount)}{b.paymentProvider === 'demo' ? ' (demo)' : ''}
            </Button>
            {b.paymentProvider === 'demo' && <Button variant="ghost" disabled={busy} onClick={() => void pay('fail')}>Simulate failed payment</Button>}
          </>
        ) : (
          <Alert kind="warning">
            <span className="flex items-center gap-1.5"><XCircle aria-hidden className="h-4 w-4" /> {b.status === 'FAILED' ? 'Payment failed — nothing was charged. The stalls were released; you can book again.' : 'The hold ran out and the stalls were released. You can book again.'}</span>
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}
