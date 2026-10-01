'use client';

import { useState } from 'react';
import { Globe, IndianRupee, Ticket, Users } from 'lucide-react';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Card, Empty, LabeledSelect, Pager, SkeletonList, Stat } from '../ui';

interface PassOrderRow {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';
  buyerName: string;
  buyerMobile: string;
  visitorCount: number;
  amount: string;
  paymentProvider: string;
  paymentReference: string | null;
  validFrom: string;
  validUntil: string;
  createdAt: string;
  paidAt: string | null;
  perPersonPasses: boolean;
  timeSlot: { label: string };
  tokens: { id: string; tokenCode: string; status: string }[];
}

/** Online pass bookings made by visitors on the public site. */
export function PassOrdersTab() {
  const ev = useEvent();
  const [status, setStatus] = useState('');
  const list = usePagedList<PassOrderRow>(`/events/${ev.eventId}/pass-orders`, { status: status || undefined });
  const totals = (list.data as unknown as { totals?: { paidOrders: number; revenue: string; visitors: number } } | null)?.totals;

  return (
    <div className="flex flex-col gap-4">
      {ev.detail && !ev.detail.publicBookingEnabled && (
        <Alert kind="info">Public pass booking is off for this festival. Turn it on in Settings and set prices on Time slots.</Alert>
      )}
      {totals && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Paid bookings" value={totals.paidOrders} tone="blue" icon={Ticket} />
          <Stat label="Visitors booked" value={totals.visitors} tone="brand" icon={Users} />
          <Stat label="Pass revenue" value={fmtMoney(totals.revenue)} tone="green" icon={IndianRupee} />
        </div>
      )}
      <SearchBar value={list.search} onChange={list.setSearch} placeholder="Search buyer, mobile or pass code" total={list.total}>
        <div className="sm:w-44">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="EXPIRED">Expired</option>
          </LabeledSelect>
        </div>
      </SearchBar>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty icon={Globe} title={list.searching || status ? 'No bookings match' : 'No online bookings yet'}>Visitors book on the public website (/book).</Empty>
      ) : (
        list.items.map((o) => (
          <Card key={o.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{o.buyerName}</span>
                  <Badge value={o.status === 'PAID' ? 'SUCCESS' : o.status} >{o.status}</Badge>
                </div>
                <div className="text-sm text-slate-600">
                  {o.buyerMobile} · {o.visitorCount} {o.visitorCount === 1 ? 'person' : 'people'} · {o.timeSlot.label}
                </div>
                <div className="text-xs text-slate-500">
                  {fmtDateTime(o.validFrom, ev.timezone)} · booked {fmtDateTime(o.createdAt, ev.timezone)}
                  {o.paymentReference ? ` · ref ${o.paymentReference}` : ''}
                </div>
              </div>
              <span className="text-lg font-extrabold tabular-nums text-green-700">{Number(o.amount) > 0 ? fmtMoney(o.amount) : 'Free'}</span>
            </div>
            {o.tokens.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {o.tokens.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 font-mono text-xs font-semibold text-orange-900 ring-1 ring-orange-200">
                    {t.tokenCode}
                    <span className="font-sans text-[10px] font-bold text-slate-500">{t.status}</span>
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
    </div>
  );
}
