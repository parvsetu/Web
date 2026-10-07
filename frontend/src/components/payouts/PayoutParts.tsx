'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownToLine, BadgeIndianRupee, Banknote, CheckCircle2, Clock3, Landmark, Percent, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime, fmtMoney } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import type { Paged, Payout, PayoutStatus, RegisteredType, SettlementPage, SettlementStatus, SettlementTotals } from '@/lib/types';
import { Badge, Card, Empty, Pager, SkeletonList, Stat, Table, Td, cx } from '../ui';

export const REGISTERED_TYPE_LABEL: Record<RegisteredType, string> = {
  TRUST: 'Public charitable trust',
  SOCIETY: 'Registered society',
  SECTION8: 'Section 8 company',
  PARTNERSHIP: 'Partnership firm',
  PROPRIETORSHIP: 'Proprietorship',
  OTHER: 'Other registered body',
};

export const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Under review', cls: 'bg-amber-100 text-amber-900' },
  VERIFIED: { label: 'Verified', cls: 'bg-green-100 text-green-800' },
  NEEDS_CORRECTION: { label: 'Needs correction', cls: 'bg-red-100 text-red-800' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
};

export function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const m = PAYOUT_STATUS_META[status];
  return <Badge className={m.cls}>{m.label}</Badge>;
}

const SETTLEMENT_LABEL: Record<SettlementStatus, string> = { PENDING_PAYOUT: 'Pending payout', PAID_OUT: 'Paid out' };
const SOURCE_LABEL: Record<string, string> = { PASS_ORDER: 'Online pass', DONATION: 'Online donation', STALL_BOOKING: 'Stall booking' };

export function SettlementBadge({ status }: { status: SettlementStatus }) {
  return <Badge className={status === 'PAID_OUT' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}>{SETTLEMENT_LABEL[status]}</Badge>;
}

/** Paged settlements with an optional status filter; keeps the totals typed. */
export function useSettlements(path: string, filters: { status?: string; organizationId?: string }, pageSize = 20) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(filters);
  useEffect(() => setPage(1), [key]);
  const res = useAsync(() => api.get<SettlementPage>(path, { ...filters, page, pageSize }), [path, key, page, pageSize]);
  return { ...res, page, setPage, pageSize };
}

export function usePayouts(path: string, filters: { organizationId?: string } = {}, pageSize = 10) {
  const [page, setPage] = useState(1);
  const key = JSON.stringify(filters);
  useEffect(() => setPage(1), [key]);
  const res = useAsync(() => api.get<Paged<Payout>>(path, { ...filters, page, pageSize }), [path, key, page, pageSize]);
  return { ...res, page, setPage, pageSize };
}

export function SettlementTotalsGrid({ totals, netLabel = 'Net to you' }: { totals: SettlementTotals; netLabel?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat label="Gross collected" value={fmtMoney(totals.gross)} tone="blue" icon={BadgeIndianRupee} />
      <Stat label="Platform commission" value={fmtMoney(totals.commission)} tone="purple" icon={Percent} />
      <Stat label="Gateway fees" value={fmtMoney(totals.gatewayFees)} tone="slate" icon={Receipt} />
      <Stat label={netLabel} value={fmtMoney(totals.netToMandals)} tone="brand" icon={Banknote} />
      <Stat label="Pending payout" value={fmtMoney(totals.pendingPayout)} tone="amber" icon={Clock3} />
      <Stat label="Paid out" value={fmtMoney(totals.paidOut)} tone="green" icon={CheckCircle2} />
    </div>
  );
}

export function SettlementsList({
  q,
  showOrg,
  emptyText,
  rowAction,
}: {
  q: ReturnType<typeof useSettlements>;
  showOrg?: boolean;
  emptyText: ReactNode;
  rowAction?: (s: SettlementPage['items'][number]) => ReactNode;
}) {
  if (q.loading && !q.data) return <SkeletonList rows={3} />;
  const rows = q.data?.items ?? [];
  if (rows.length === 0) return <Empty icon={ArrowDownToLine} title="No settlements yet">{emptyText}</Empty>;
  const head = ['When', ...(showOrg ? ['Mandal'] : []), 'From', 'Gross', 'Commission', 'Gateway fee', 'Net', 'Status', ...(rowAction ? [''] : [])];
  return (
    <>
      {/* Phones: one compact card per settlement (a 9-column table doesn't fit). */}
      <div className="flex flex-col gap-2 sm:hidden">
        {rows.map((s) => (
          <Card key={s.id} className="flex flex-col gap-2 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {showOrg && <div className="font-bold">{s.organization?.name ?? '—'}</div>}
                <div className={cx(showOrg ? 'text-sm' : 'font-semibold')}>
                  {SOURCE_LABEL[s.sourceType] ?? s.sourceType}
                  {s.event ? <span className="text-slate-500"> · {s.event.name}</span> : null}
                </div>
                <div className="text-xs text-slate-500">{fmtDateTime(s.createdAt)}</div>
              </div>
              <SettlementBadge status={s.status} />
            </div>
            <dl className="grid grid-cols-4 gap-1 rounded-xl bg-orange-50/50 p-2 text-center text-xs ring-1 ring-orange-100">
              <div><dt className="text-slate-500">Gross</dt><dd className="font-semibold tabular-nums">{fmtMoney(s.gross)}</dd></div>
              <div><dt className="text-slate-500">Comm.</dt><dd className="font-semibold tabular-nums text-purple-700">−{fmtMoney(s.commission)}</dd></div>
              <div><dt className="text-slate-500">Gateway</dt><dd className="font-semibold tabular-nums text-slate-600">−{fmtMoney(s.gatewayFee)}</dd></div>
              <div><dt className="text-slate-500">Net</dt><dd className="font-bold tabular-nums text-green-700">{fmtMoney(s.net)}</dd></div>
            </dl>
            {rowAction && <div>{rowAction(s)}</div>}
          </Card>
        ))}
      </div>
      <Card className="hidden sm:block">
        <Table head={head}>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="whitespace-nowrap text-xs">{fmtDateTime(s.createdAt)}</Td>
              {showOrg && <Td className="font-semibold">{s.organization?.name ?? '—'}</Td>}
              <Td>
                <div className="font-semibold">{SOURCE_LABEL[s.sourceType] ?? s.sourceType}</div>
                <div className="text-xs text-slate-500">{s.event?.name ?? '—'}</div>
              </Td>
              <Td className="tabular-nums">{fmtMoney(s.gross)}</Td>
              <Td className="tabular-nums text-purple-700">−{fmtMoney(s.commission)}</Td>
              <Td className="tabular-nums text-slate-600">−{fmtMoney(s.gatewayFee)}</Td>
              <Td className="font-bold tabular-nums text-green-700">{fmtMoney(s.net)}</Td>
              <Td><SettlementBadge status={s.status} /></Td>
              {rowAction && <Td>{rowAction(s)}</Td>}
            </tr>
          ))}
        </Table>
      </Card>
      <Pager page={q.page} pageSize={q.pageSize} total={q.data?.total ?? 0} onPage={q.setPage} />
    </>
  );
}

export function PayoutsList({ q, showOrg, emptyText }: { q: ReturnType<typeof usePayouts>; showOrg?: boolean; emptyText: ReactNode }) {
  if (q.loading && !q.data) return <SkeletonList rows={2} />;
  const rows = q.data?.items ?? [];
  if (rows.length === 0) return <Empty icon={Landmark} title="No payouts yet">{emptyText}</Empty>;
  return (
    <>
      <div className="flex flex-col gap-2">
        {rows.map((p) => (
          <Card key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-sm">
              <Landmark aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-extrabold tabular-nums text-green-700">{fmtMoney(p.amount)}</div>
              {showOrg && p.organization && <div className="font-semibold text-slate-800">{p.organization.name}</div>}
              <div className="text-xs text-slate-500">
                {fmtDateTime(p.paidAt)} · {p.settlements} settlement{p.settlements === 1 ? '' : 's'}
                {p.note ? ` · ${p.note}` : ''}
              </div>
            </div>
            <div className="w-full min-w-0 rounded-xl bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 sm:w-auto sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">UTR / reference</div>
              <div className="break-all font-mono text-sm font-semibold text-slate-900">{p.reference}</div>
            </div>
          </Card>
        ))}
      </div>
      <Pager page={q.page} pageSize={q.pageSize} total={q.data?.total ?? 0} onPage={q.setPage} />
    </>
  );
}

const MAX_PROOF_BYTES = 2 * 1024 * 1024;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });
}

/**
 * Cancelled cheque / passbook proof as a data URL the API accepts:
 * photos are downscaled and re-encoded as JPEG (stays readable, well under
 * 2 MB); PDFs are sent as-is if they fit.
 */
export async function proofToDataUrl(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PROOF_BYTES) throw new Error('That PDF is larger than 2 MB. Scan it at a lower resolution or upload a photo instead.');
    return readAsDataUrl(file);
  }
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Upload a photo (JPG or PNG) or a PDF.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not read that image.'));
      i.src = url;
    });
    for (const max of [1800, 1400, 1100]) {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Your browser could not process the image.');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.72, 0.6]) {
        const data = c.toDataURL('image/jpeg', q);
        if (data.startsWith('data:image/jpeg') && data.length * 0.75 < MAX_PROOF_BYTES * 0.9) return data;
      }
    }
    throw new Error('That photo is too large even after resizing. Try a closer, simpler photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
