'use client';

import { api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtMoney, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import type { Receipt } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { Alert, Button, SkeletonList } from '@/components/ui';
import { Printer } from 'lucide-react';

export default function ReceiptPage({ params }: { params: { donationId: string } }) {
  const ev = useEvent();
  return (
    <AppShell festivalType={ev.festivalType} title="Donation receipt" subtitle={ev.name} back={`/e/${ev.eventId}/admin#donations`}>
      <EventGate anyOf={['DONATION_VIEW']}>
        <ReceiptView donationId={params.donationId} />
      </EventGate>
    </AppShell>
  );
}

function ReceiptView({ donationId }: { donationId: string }) {
  const ev = useEvent();
  const q = useAsync(() => api.get<Receipt>(`/events/${ev.eventId}/donations/${donationId}/receipt`), [ev.eventId, donationId]);
  if (q.loading) return <SkeletonList rows={3} />;
  if (q.error) return <Alert>{q.error}</Alert>;
  const r = q.data;
  if (!r) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex justify-end">
        <Button onClick={() => window.print()}><Printer aria-hidden className="h-4 w-4" /> Print receipt</Button>
      </div>
      <article className="mx-auto w-full max-w-xl rounded-2xl border-2 border-slate-900 bg-white p-6 print:border-slate-900">
        <header className="border-b border-slate-300 pb-3 text-center">
          <h1 className="text-2xl font-extrabold">{r.organization.name}</h1>
          {(r.organization.address || r.organization.city) && (
            <p className="text-sm text-slate-600">{[r.organization.address, r.organization.city].filter(Boolean).join(', ')}</p>
          )}
          <p className="mt-1 text-sm font-semibold">{r.event.name}</p>
          <p className="mt-2 text-lg font-bold uppercase tracking-wide">Donation Receipt</p>
        </header>
        <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-base">
          <dt className="text-slate-600">Receipt no.</dt>
          <dd className="font-mono font-bold">{r.receiptNo}</dd>
          <dt className="text-slate-600">Date</dt>
          <dd>{fmtDateTime(r.donatedAt, ev.timezone)}</dd>
          <dt className="text-slate-600">Received from</dt>
          <dd className="font-semibold">{r.donorName}</dd>
          <dt className="text-slate-600">Amount</dt>
          <dd className="text-xl font-extrabold">{fmtMoney(r.amount)}</dd>
          <dt className="text-slate-600">In words</dt>
          <dd className="italic">{r.amountInWords}</dd>
          <dt className="text-slate-600">Method</dt>
          <dd>{humanize(r.method)}</dd>
          {r.paymentReference && (
            <>
              <dt className="text-slate-600">Reference</dt>
              <dd className="font-mono">{r.paymentReference}</dd>
            </>
          )}
        </dl>
        <footer className="mt-10 flex justify-between text-sm text-slate-600">
          <span>Thank you for your contribution.</span>
          <span className="border-t border-slate-400 pt-1">Authorised signatory</span>
        </footer>
      </article>
    </div>
  );
}
