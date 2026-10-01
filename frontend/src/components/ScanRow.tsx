'use client';

import { fmtDateTime } from '@/lib/format';
import type { ScanLogRow } from '@/lib/types';
import { Badge, Card } from './ui';

export function ScanRowCard({ row, tz, showUser }: { row: ScanLogRow; tz: string; showUser?: boolean }) {
  return (
    <Card className="py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono font-semibold">{row.tokenCode ?? '—'}</span>
        <Badge value={row.result} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
        <span>{fmtDateTime(row.scanTime, tz)}</span>
        <span>{row.method}</span>
        {showUser && <span>by {row.user?.name}</span>}
        {row.voided && <span className="font-semibold text-amber-700">Voided (reactivated)</span>}
      </div>
    </Card>
  );
}
