'use client';

import { useState } from 'react';
import { Store } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { usePagedList } from '@/lib/paged';
import { fmtDate, fmtMoney } from '@/lib/format';
import { STALL_CATEGORY_LABEL, type AdminVendor } from '@/lib/stall-types';
import { SearchBar } from '../SearchBar';
import { Alert, Badge, Button, Card, Empty, Field, Modal, Pager, SkeletonList, Textarea } from '../ui';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'SUSPENDED', label: 'Suspended' },
] as const;

/** Super admin: stall-vendor accounts (self-registered; suspend to stop new bookings). */
export function VendorsAdmin() {
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const q = usePagedList<AdminVendor>('/platform/vendors', { status: status || undefined }, { pageSize: 20 });
  const [acting, setActing] = useState<AdminVendor | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Vendors sign up themselves and can book stalls once their email is verified — paying online confirms each booking. Suspend a vendor to stop new bookings; they
        keep read access to past bookings.
      </p>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f.key || 'all'} type="button" aria-pressed={status === f.key} onClick={() => setStatus(f.key)} className={`min-h-[40px] rounded-full border px-3 text-sm font-semibold ${status === f.key ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <SearchBar value={q.search} onChange={q.setSearch} placeholder="Search business, contact, email, mobile or city" />
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList rows={3} />
      ) : !q.items.length ? (
        <Empty title="No vendors" icon={Store}>Vendors appear here when they sign up at /vendor/signup.</Empty>
      ) : (
        q.items.map((v) => (
          <Card key={v.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{v.businessName}</p>
                <p className="text-xs text-slate-500">{[v.category && STALL_CATEGORY_LABEL[v.category], v.city, `since ${fmtDate(v.createdAt.slice(0, 10))}`].filter(Boolean).join(' · ')}</p>
              </div>
              <Badge value={v.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'}>{v.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Badge>
            </div>
            <p className="text-sm text-slate-600">{v.contactName} · {v.contactPhone} · {v.contactEmail}{v.gstin ? ` · GSTIN ${v.gstin}` : ''}</p>
            <p className="text-sm">{v.paidBookings} paid booking{v.paidBookings === 1 ? '' : 's'} · {fmtMoney(v.paidAmount)}</p>
            {v.statusNote && <p className="text-xs text-slate-500">Note: {v.statusNote}</p>}
            <div>
              <Button size="sm" variant={v.status === 'ACTIVE' ? 'secondary' : 'success'} onClick={() => setActing(v)}>{v.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</Button>
            </div>
          </Card>
        ))
      )}
      <Pager page={q.page} pageSize={q.pageSize} total={q.total} onPage={q.setPage} />
      {acting && <StatusModal v={acting} onClose={() => setActing(null)} onDone={() => { setActing(null); q.reload(); }} />}
    </div>
  );
}

function StatusModal({ v, onClose, onDone }: { v: AdminVendor; onClose: () => void; onDone: () => void }) {
  const to = v.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/platform/vendors/${v.id}/status`, { status: to, note: note.trim() || undefined });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`${to === 'SUSPENDED' ? 'Suspend' : 'Reactivate'} ${v.businessName}`}>
      <div className="flex flex-col gap-3">
        <Field label="Note (optional)" hint={to === 'SUSPENDED' ? 'Shown to the vendor on their dashboard.' : undefined}>
          <Textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button variant={to === 'SUSPENDED' ? 'danger' : 'success'} loading={busy} onClick={() => void go()}>{to === 'SUSPENDED' ? 'Suspend' : 'Reactivate'}</Button>
      </div>
    </Modal>
  );
}
