'use client';

import { api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import type { Receipt } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import { DonationReceipt } from '@/components/DonationReceipt';
import { ReceiptShareActions } from '@/components/ReceiptShareActions';
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
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
        <ReceiptShareActions
          eventId={ev.eventId}
          donationId={donationId}
          donorName={r.donorName}
          donorEmail={r.donorEmail}
          amount={r.amount}
          eventName={r.event.name}
        />
        <Button onClick={() => window.print()}>
          <Printer aria-hidden className="h-4 w-4" /> Print receipt
        </Button>
      </div>
      <DonationReceipt r={r} timezone={ev.timezone} />
    </div>
  );
}
