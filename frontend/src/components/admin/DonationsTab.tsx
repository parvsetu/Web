'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtMoney, humanize, isoToLocalInput, localInputToIso } from '@/lib/format';
import { useAsync, useDebounced } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { Donation, DonationCreateResponse, Paged, PaymentProvider } from '@/lib/types';
import { Alert, Badge, Button, Card, Empty, Field, LabeledInput, LabeledSelect, Modal, Pager, SkeletonList, Textarea } from '../ui';

// API.md doesn't enumerate these; the server validates.
export const DONATION_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER'];
export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'];

export function DonationsTab() {
  const ev = useEvent();
  const [f, setF] = useState({ status: '', method: '', from: '', to: '' });
  const [qText, setQText] = useState('');
  const q = useDebounced(qText);
  const [page, setPage] = useState(1);
  const list = useAsync(() => api.get<Paged<Donation>>(`/events/${ev.eventId}/donations`, { ...f, q, page }), [ev.eventId, f, q, page]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Donation | null>(null);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      {can(ev.perms, 'DONATION_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>Record donation</Button>
        </div>
      )}
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 sm:col-span-1">
          <LabeledInput label="Search" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Donor, receipt no." />
        </div>
        <LabeledSelect label="Status" value={f.status} onChange={(e) => set('status')(e.target.value)}>
          <option value="">All</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect label="Method" value={f.method} onChange={(e) => set('method')(e.target.value)}>
          <option value="">All</option>
          {DONATION_METHODS.map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </LabeledSelect>
        <LabeledInput label="From" type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} />
        <LabeledInput label="To" type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} />
      </Card>
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.data && list.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {list.data.items.map((d) => (
            <Card key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{d.donorName}</span>
                  <Badge value={d.paymentStatus} />
                </div>
                <div className="text-xs text-slate-500">
                  {d.receiptNo ? `#${d.receiptNo} · ` : ''}
                  {humanize(d.method)} · {fmtDateTime(d.donatedAt, ev.timezone)}
                  {d.paymentReference ? ` · Ref ${d.paymentReference}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tabular-nums">{fmtMoney(d.amount, d.currency || 'INR')}</span>
                {d.paymentStatus === 'SUCCESS' && (
                  <Link
                    href={`/e/${ev.eventId}/donations/${d.id}/receipt`}
                    className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 px-3 text-sm font-semibold"
                  >
                    Receipt
                  </Link>
                )}
                {can(ev.perms, 'DONATION_UPDATE') && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(d)}>
                    Update
                  </Button>
                )}
              </div>
            </Card>
          ))}
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </div>
      ) : (
        <Empty title="No donations yet" />
      )}
      {creating && (
        <CreateDonation
          onClose={() => setCreating(false)}
          onDone={() => {
            list.reload();
          }}
        />
      )}
      {editing && (
        <UpdateDonation
          donation={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function CreateDonation({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const providers = useAsync(() => api.get<PaymentProvider[]>('/payments/providers'), []);
  const [form, setForm] = useState({
    donorName: '',
    donorMobile: '',
    donorEmail: '',
    amount: '',
    method: 'CASH',
    provider: 'manual',
    paymentReference: '',
    notes: '',
    donatedAt: isoToLocalInput(new Date().toISOString()),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<DonationCreateResponse | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((x) => ({ ...x, [k]: e.target.value }));
  const provider = providers.data?.find((p) => p.key === form.provider);
  const online = !!provider?.online;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.donorName.trim()) return setError('Enter the donor name.');
    if (!/^\d+(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) return setError('Enter a valid amount, e.g. 501 or 1500.00.');
    const body: Record<string, unknown> = {
      donorName: form.donorName.trim(),
      amount: Number(form.amount).toFixed(2),
      method: form.method,
      provider: form.provider || 'manual',
    };
    if (form.donorMobile.trim()) body.donorMobile = form.donorMobile.trim();
    if (form.donorEmail.trim()) body.donorEmail = form.donorEmail.trim();
    if (form.paymentReference.trim()) body.paymentReference = form.paymentReference.trim();
    if (form.notes.trim()) body.notes = form.notes.trim();
    if (form.donatedAt && !online) body.donatedAt = localInputToIso(form.donatedAt);
    setBusy(true);
    try {
      const res = await api.post<DonationCreateResponse>(`/events/${ev.eventId}/donations`, body);
      setCreated(res);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal open onClose={onClose} title="Donation recorded">
        <div className="flex flex-col gap-4">
          <Alert kind={created.paymentStatus === 'SUCCESS' ? 'success' : 'info'}>
            {fmtMoney(created.amount)} from {created.donorName} — status {humanize(created.paymentStatus)}
            {created.receiptNo ? `, receipt #${created.receiptNo}` : ''}.
          </Alert>
          {created.payment && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-slate-600">Ask the donor to complete the payment. The status updates automatically once the provider confirms it.</p>
              {created.payment.checkoutUrl && (
                <a href={created.payment.checkoutUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Open payment page
                </a>
              )}
              {created.payment.upiUri && (
                <a href={created.payment.upiUri} className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-brand-600 font-semibold text-white">
                  Pay with UPI app
                </a>
              )}
              <p className="text-xs text-slate-500">Order ID: {created.payment.providerOrderId}</p>
            </div>
          )}
          {created.paymentStatus === 'SUCCESS' && (
            <Link href={`/e/${ev.eventId}/donations/${created.id}/receipt`} className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 font-semibold">
              View / print receipt
            </Link>
          )}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Record donation">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Donor name" value={form.donorName} onChange={set('donorName')} />
        <LabeledInput label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="501" />
        <div className="grid grid-cols-2 gap-3">
          <LabeledSelect label="Method" value={form.method} onChange={set('method')}>
            {DONATION_METHODS.map((m) => (
              <option key={m} value={m}>
                {humanize(m)}
              </option>
            ))}
          </LabeledSelect>
          <LabeledSelect label="Collected via" value={form.provider} onChange={set('provider')}>
            <option value="manual">Already received (cash / UPI)</option>
            {(providers.data ?? [])
              .filter((p) => p.key !== 'manual')
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                  {p.online ? ' (online)' : ''}
                </option>
              ))}
          </LabeledSelect>
        </div>
        {online && <p className="text-sm text-slate-600">An online payment request will be created. It stays Pending until the provider confirms.</p>}
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Mobile (optional)" type="tel" value={form.donorMobile} onChange={set('donorMobile')} />
          <LabeledInput label="Email (optional)" type="email" value={form.donorEmail} onChange={set('donorEmail')} />
        </div>
        {!online && (
          <>
            <LabeledInput label="Payment reference (optional)" value={form.paymentReference} onChange={set('paymentReference')} placeholder="UPI txn id / cheque no." />
            <LabeledInput label="Received at" type="datetime-local" value={form.donatedAt} onChange={set('donatedAt')} />
          </>
        )}
        <Field label="Notes (optional)">
          <Textarea value={form.notes} onChange={set('notes')} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Save donation
        </Button>
      </form>
    </Modal>
  );
}

function UpdateDonation({ donation, onClose, onDone }: { donation: Donation; onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const [status, setStatus] = useState(donation.paymentStatus);
  const [ref, setRef] = useState(donation.paymentReference ?? '');
  const [notes, setNotes] = useState(donation.notes ?? '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (status !== donation.paymentStatus) body.paymentStatus = status;
    if (ref !== (donation.paymentReference ?? '')) body.paymentReference = ref;
    if (notes !== (donation.notes ?? '')) body.notes = notes;
    if (Object.keys(body).length === 0) return onClose();
    if (reason.trim()) body.reason = reason.trim();
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/events/${ev.eventId}/donations/${donation.id}`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Update donation — ${donation.donorName}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledSelect label="Payment status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </LabeledSelect>
        <LabeledInput label="Payment reference" value={ref} onChange={(e) => setRef(e.target.value)} />
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <LabeledInput label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Save
        </Button>
      </form>
    </Modal>
  );
}
