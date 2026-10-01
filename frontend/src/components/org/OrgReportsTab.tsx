'use client';

import Link from 'next/link';
import { api, asArray } from '@/lib/api';
import { fmtMoney, fmtNum } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import type { SummaryReport } from '@/lib/types';
import { Alert, Card, Empty, SkeletonList, Table, Td } from '../ui';

export function OrgReportsTab() {
  const org = useOrg();
  const q = useAsync(() => api.get<SummaryReport[]>(`/organizations/${org.orgId}/reports/events`).then((r) => asArray(r)), [org.orgId]);
  if (q.loading && !q.data) return <SkeletonList />;
  if (q.error) return <Alert>{q.error}</Alert>;
  const rows = q.data ?? [];
  if (rows.length === 0) return <Empty title="No festivals to report on" />;
  return (
    <Card>
      <Table head={['Festival', 'Visitors', 'Entries', 'Tokens', 'Used', 'Donations', 'Expenses', 'Balance']}>
        {rows.map((r) => (
          <tr key={r.event.id}>
            <Td className="font-semibold">
              <Link href={`/e/${r.event.id}/admin#reports`} className="underline">
                {r.event.name}
              </Link>
            </Td>
            <Td>{fmtNum(r.visitors.total)}</Td>
            <Td>{fmtNum(r.visitors.entries)}</Td>
            <Td>{fmtNum(r.tokens.total)}</Td>
            <Td>{fmtNum(r.tokens.used)}</Td>
            <Td>{r.donations ? fmtMoney(r.donations.total) : '—'}</Td>
            <Td>{r.expenses ? fmtMoney(r.expenses.total) : '—'}</Td>
            <Td>{r.balance !== null ? fmtMoney(r.balance) : '—'}</Td>
          </tr>
        ))}
      </Table>
      {rows.some((r) => r.restricted.length > 0) && <p className="mt-2 text-xs text-slate-500">“—” = hidden for your role.</p>}
    </Card>
  );
}
