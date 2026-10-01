'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime, fmtHour, fmtMoney, fmtNum, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import type { Dashboard } from '@/lib/types';
import { ScanRowCard } from '../ScanRow';
import { Alert, BarChart, Button, Card, Empty, LabeledInput, SectionTitle, SkeletonList, Stat, Table, Td } from '../ui';

export function OverviewTab() {
  const ev = useEvent();
  const [date, setDate] = useState(() => todayIn(ev.timezone));
  const q = useAsync(() => api.get<Dashboard>(`/events/${ev.eventId}/dashboard`, { date }), [ev.eventId, date]);
  const d = q.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex-1 sm:max-w-xs">
          <LabeledInput label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={q.reload} aria-label="Refresh">
          Refresh
        </Button>
      </div>
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !d ? (
        <SkeletonList rows={4} />
      ) : d ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Visitors" value={fmtNum(d.today.visitors)} tone="brand" />
            <Stat label="Entries" value={fmtNum(d.today.entries)} tone="green" />
            <Stat label="Tokens issued" value={fmtNum(d.today.tokensIssued)} />
            <Stat label="Used" value={fmtNum(d.today.used)} />
            <Stat label="Unused" value={fmtNum(d.today.unused)} />
            <Stat label="Expired" value={fmtNum(d.today.expired)} tone="amber" />
            <Stat label="Cancelled" value={fmtNum(d.today.cancelled)} tone="red" />
          </div>

          <SectionTitle>Whole festival</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total visitors" value={fmtNum(d.overall.visitors.total)} tone="brand" />
            <Stat label="Tokens" value={fmtNum(d.overall.tokens.total)} />
            {d.overall.donations ? <Stat label="Donations" value={fmtMoney(d.overall.donations.total)} tone="green" /> : null}
            {d.overall.expenses ? <Stat label="Expenses" value={fmtMoney(d.overall.expenses.total)} tone="red" /> : null}
            {d.overall.balance !== null ? <Stat label="Balance" value={fmtMoney(d.overall.balance)} /> : null}
          </div>
          {d.overall.restricted.length > 0 && <p className="text-xs text-slate-500">Financial figures are hidden for your role.</p>}

          <SectionTitle>Entries by hour</SectionTitle>
          <Card>
            <BarChart
              label="Entries by hour"
              data={d.hourly.map((h) => ({ key: String(h.hour), label: fmtHour(h.hour), value: h.entries }))}
            />
          </Card>

          <SectionTitle>Volunteer activity</SectionTitle>
          {d.volunteerActivity.length === 0 ? (
            <Empty title="No scans yet" />
          ) : (
            <Card>
              <Table head={['Volunteer', 'Scans', 'Allowed', 'Denied', 'Last active']}>
                {d.volunteerActivity.map((v) => (
                  <tr key={v.userId}>
                    <Td className="font-semibold">{v.name}</Td>
                    <Td>{fmtNum(v.total)}</Td>
                    <Td className="text-green-700">{fmtNum(v.successful)}</Td>
                    <Td className="text-red-700">{fmtNum(v.failed)}</Td>
                    <Td>{fmtDateTime(v.lastActiveAt, ev.timezone)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <SectionTitle>Recent scans</SectionTitle>
          {d.recentScans.length === 0 ? (
            <Empty title="No scans yet" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {d.recentScans.map((s) => (
                <ScanRowCard key={s.id} row={s} tz={ev.timezone} showUser />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
