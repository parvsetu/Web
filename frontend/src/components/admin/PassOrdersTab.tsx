'use client';

import { useState } from 'react';
import { Globe, IndianRupee, Ticket, Undo2, Users } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { can } from '@/lib/permissions';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { usePagedList } from '@/lib/paged';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SkeletonList, Stat, Textarea } from '../ui';

interface PassRefund {
  cancelledAt: string | null;
  reason: string | null;
  amount: string;
  /** NONE = nothing refunded; TO_SEND = still to be sent; SENT = reference recorded. */
  state: 'NONE' | 'TO_SEND' | 'SENT';
  reference: string | null;
  refundedAt: string | null;
  creditNoteNo: string | null;
}

interface PassOrderRow {
  id: string;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
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
  invoiceNo: string | null;
  gst: string;
  perPersonPasses: boolean;
  timeSlot: { label: string } | null;
  tokens: { id: string; tokenCode: string; status: string }[];
  /** Blogger whose referral link/code brought this booking. */
  referral?: { code: string | null; bloggerName: string } | null;
  refund: PassRefund | null;
}

interface Totals {
  paidOrders: number;
  revenue: string;
  visitors: number;
  cancelledOrders: number;
  refunded: string;
  refundsToSend: { count: number; amount: string };
}

/** Online pass bookings made by visitors on the public site. */
export function PassOrdersTab() {
  const ev = useEvent();
  const manage = can(ev.perms, 'DONATION_UPDATE');
  const [status, setStatus] = useState('');
  const filters = status === 'TO_SEND' ? { refundToSend: 'true' } : { status: status || undefined };
  const list = usePagedList<PassOrderRow>(`/events/${ev.eventId}/pass-orders`, filters);
  const totals = (list.data as unknown as { totals?: Totals } | null)?.totals;
  const [cancelling, setCancelling] = useState<PassOrderRow | null>(null);
  const [marking, setMarking] = useState<PassOrderRow | null>(null);
  const done = () => { setCancelling(null); setMarking(null); list.reload(); };

  return (
    <div className="flex flex-col gap-4">
      {ev.detail && !ev.detail.publicBookingEnabled && (
        <Alert kind="info">Public pass booking is off for this festival. Turn it on in Settings and set prices on Time slots.</Alert>
      )}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Paid bookings" value={totals.paidOrders} tone="blue" icon={Ticket} />
          <Stat label="Visitors booked" value={totals.visitors} tone="brand" icon={Users} />
          <Stat label="Pass revenue (net of refunds)" value={fmtMoney(totals.revenue)} tone="green" icon={IndianRupee} />
          <Stat label={`Refunded · ${totals.cancelledOrders} cancelled`} value={fmtMoney(totals.refunded)} tone="red" icon={Undo2} />
        </div>
      )}
      {totals && totals.refundsToSend.count > 0 && (
        <Alert kind="warning">
          {totals.refundsToSend.count} {totals.refundsToSend.count === 1 ? 'refund' : 'refunds'} ({fmtMoney(totals.refundsToSend.amount)}) still to be sent.{' '}
          <button type="button" className="font-semibold underline" onClick={() => setStatus('TO_SEND')}>Show them</button>
        </Alert>
      )}
      <SearchBar value={list.search} onChange={list.setSearch} placeholder="Search buyer, mobile or pass code" total={list.total}>
        <div className="sm:w-48">
          <LabeledSelect label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="TO_SEND">Refund to send</option>
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
                  {o.refund?.state === 'TO_SEND' && <Badge className="bg-amber-100 text-amber-800">Refund to send</Badge>}
                  {o.referral && <Badge className="bg-fuchsia-100 text-fuchsia-800">via {o.referral.bloggerName}{o.referral.code ? ` · ${o.referral.code}` : ''}</Badge>}
                </div>
                <div className="text-sm text-slate-600">
                  {o.buyerMobile} · {o.visitorCount} {o.visitorCount === 1 ? 'person' : 'people'}{o.timeSlot ? ` · ${o.timeSlot.label}` : ''}
                </div>
                <div className="text-xs text-slate-500">
                  {fmtDateTime(o.validFrom, ev.timezone)} · booked {fmtDateTime(o.createdAt, ev.timezone)}
                  {o.paymentReference ? ` · ref ${o.paymentReference}` : ''}
                  {o.invoiceNo ? ` · ${o.invoiceNo}` : ''}
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
            {o.refund && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">
                Cancelled {o.refund.cancelledAt ? fmtDateTime(o.refund.cancelledAt, ev.timezone) : ''}{o.refund.reason ? ` — ${o.refund.reason}` : ''} · refund {fmtMoney(o.refund.amount)}
                {o.refund.reference ? ` (ref ${o.refund.reference})` : ''}{o.refund.creditNoteNo ? ` · credit note ${o.refund.creditNoteNo}` : ''}
              </div>
            )}
            {manage && (o.status === 'PAID' || o.refund?.state === 'TO_SEND') && (
              <div className="flex flex-wrap gap-2">
                {o.status === 'PAID' && <Button size="sm" variant="danger" onClick={() => setCancelling(o)}>Cancel &amp; refund</Button>}
                {o.refund?.state === 'TO_SEND' && <Button size="sm" onClick={() => setMarking(o)}>Mark refund sent</Button>}
              </div>
            )}
          </Card>
        ))
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      {cancelling && <CancelModal eventId={ev.eventId} o={cancelling} onClose={() => setCancelling(null)} onSaved={done} />}
      {marking && <RefundSentModal eventId={ev.eventId} o={marking} onClose={() => setMarking(null)} onSaved={done} />}
    </div>
  );
}

/**
 * Cancel a paid booking. The default refund is the unused share (all of it when
 * nobody has been let in yet) — the API works that out when `refund` is left out.
 */
function CancelModal({ eventId, o, onClose, onSaved }: { eventId: string; o: PassOrderRow; onClose: () => void; onSaved: () => void }) {
  const usedPasses = o.tokens.filter((t) => t.status === 'USED').length;
  const [reason, setReason] = useState('');
  const [custom, setCustom] = useState(false);
  const [refund, setRefund] = useState(o.amount);
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) return setError('Give a reason (at least 5 characters) — the buyer sees it.');
    if (custom && (!/^\d+(\.\d{1,2})?$/.test(refund) || Number(refund) > Number(o.amount))) return setError(`Refund must be between ₹0 and ${fmtMoney(o.amount)}.`);
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${eventId}/pass-orders/${o.id}/cancel`, {
        reason: reason.trim(), ...(custom ? { refund } : {}), ...(ref.trim() ? { refundReference: ref.trim() } : {}),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancel booking · ${o.buyerName}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          {o.visitorCount} {o.visitorCount === 1 ? 'person' : 'people'}, paid {fmtMoney(o.amount)}. Unused passes stop working at once. Parvsetu returns its fee on the refunded part and the rest is taken from your next payout.
          {o.invoiceNo && Number(o.gst) > 0 ? ' A GST credit note is issued for the refunded part.' : ''}
        </p>
        {usedPasses > 0 && (
          <Alert kind="info">{usedPasses} of {o.tokens.length} {o.tokens.length === 1 ? 'pass was' : 'passes were'} already used. By default only the unused share is refunded.</Alert>
        )}
        <Field label="Reason (shown to the buyer)" required>
          <Textarea rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <LabeledSelect label="Refund" value={custom ? 'custom' : 'default'} onChange={(e) => setCustom(e.target.value === 'custom')}>
          <option value="default">{usedPasses > 0 ? 'Unused share (worked out for you)' : `Full amount (${fmtMoney(o.amount)})`}</option>
          <option value="custom">Another amount</option>
        </LabeledSelect>
        {custom && (
          <LabeledInput label="Refund to buyer (₹)" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^\d.]/g, ''))} hint={`Up to ${fmtMoney(o.amount)}. Enter 0 for no refund.`} />
        )}
        <LabeledInput label="Refund reference (optional)" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} placeholder="UPI / UTR / gateway refund id" hint="Leave empty: Parvsetu refunds through the payment gateway when it can, otherwise the refund waits for you to send it." />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="danger" loading={busy}>Cancel booking</Button>
        <p className="text-xs text-slate-500">This can’t be undone.</p>
      </form>
    </Modal>
  );
}

/** The refund was paid outside Parvsetu (UPI / bank transfer): record its reference. */
function RefundSentModal({ eventId, o, onClose, onSaved }: { eventId: string; o: PassOrderRow; onClose: () => void; onSaved: () => void }) {
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (ref.trim().length < 3) return setError('Enter the UPI / UTR / gateway reference (at least 3 characters).');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${eventId}/pass-orders/${o.id}/refund-sent`, { refundReference: ref.trim() });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Refund sent · ${o.buyerName}`}>
      <form onSubmit={save} className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Refund of {fmtMoney(o.refund?.amount ?? '0')} to {o.buyerMobile}.</p>
        <LabeledInput label="Refund reference" required value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} placeholder="UPI / UTR / gateway refund id" />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Modal>
  );
}
