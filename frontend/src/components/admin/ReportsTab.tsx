'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDate, fmtDateTime, fmtHour, fmtMoney, fmtNum, humanize } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { FinanceReport, ScansReport, SummaryReport, TokensReport, VisitorsReport, VolunteerStats } from '@/lib/types';
import { Alert, BarChart, Button, Card, Empty, LabeledInput, SkeletonList, Stat, Table, Td, Tabs } from '../ui';
import { FileDown } from 'lucide-react';

type ReportKey = 'summary' | 'tokens' | 'visitors' | 'scans' | 'volunteers' | 'finance';

export function ReportsTab() {
  const ev = useEvent();
  const canFinance = can(ev.perms, 'DONATION_VIEW') && can(ev.perms, 'EXPENSE_VIEW');
  const canExport = can(ev.perms, 'REPORT_EXPORT');
  const [range, setRange] = useState({ from: '', to: '' });
  const [report, setReport] = useState<ReportKey>('summary');
  const [exportErr, setExportErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'tokens', label: 'Tokens' },
    { key: 'visitors', label: 'Visitors' },
    { key: 'scans', label: 'Scans' },
    { key: 'volunteers', label: 'Volunteers' },
    ...(canFinance ? [{ key: 'finance', label: 'Finance' }] : []),
  ];

  async function exportCsv() {
    setExporting(true);
    setExportErr(null);
    try {
      await downloadFile(`/events/${ev.eventId}/reports/${report}`, { ...range, format: 'csv' }, `${ev.name.replace(/\W+/g, '-')}-${report}.csv`);
    } catch (e) {
      setExportErr(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-3">
        <div className="min-w-[140px] flex-1">
          <LabeledInput label="From" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </div>
        <div className="min-w-[140px] flex-1">
          <LabeledInput label="To" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        {(range.from || range.to) && (
          <Button variant="ghost" onClick={() => setRange({ from: '', to: '' })}>
            Clear
          </Button>
        )}
      </Card>
      <Tabs tabs={tabs} active={report} onChange={(k) => setReport(k as ReportKey)} />
      {canExport && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}>
            <FileDown aria-hidden className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      )}
      {exportErr && <Alert>{exportErr}</Alert>}
      {report === 'summary' && <SummaryView range={range} />}
      {report === 'tokens' && <TokensView range={range} />}
      {report === 'visitors' && <VisitorsView range={range} />}
      {report === 'scans' && <ScansView range={range} />}
      {report === 'volunteers' && <VolunteersView range={range} />}
      {report === 'finance' && canFinance && <FinanceView range={range} />}
    </div>
  );
}

type Range = { from: string; to: string };

function useReport<T>(name: string, range: Range) {
  const ev = useEvent();
  return useAsync(() => api.get<T>(`/events/${ev.eventId}/reports/${name}`, range), [ev.eventId, name, range.from, range.to]);
}

function Loader<T>({ q, children }: { q: { loading: boolean; error: string | null; data: T | null }; children: (d: T) => ReactNode }) {
  if (q.loading && !q.data) return <SkeletonList rows={3} />;
  if (q.error) return <Alert>{q.error}</Alert>;
  if (!q.data) return <Empty title="No data" />;
  return <>{children(q.data)}</>;
}

function SummaryView({ range }: { range: Range }) {
  const q = useReport<SummaryReport>('summary', range);
  return (
    <Loader q={q}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Visitors" value={fmtNum(d.visitors.total)} tone="brand" />
            <Stat label="Entries" value={fmtNum(d.visitors.entries)} tone="green" />
            <Stat label="Tokens" value={fmtNum(d.tokens.total)} />
            <Stat label="Used" value={fmtNum(d.tokens.used)} />
            <Stat label="Unused" value={fmtNum(d.tokens.unused)} />
            <Stat label="Expired" value={fmtNum(d.tokens.expired)} tone="amber" />
            <Stat label="Cancelled" value={fmtNum(d.tokens.cancelled)} tone="red" />
            <Stat label="Scans (ok / failed)" value={`${fmtNum(d.scans.success)} / ${fmtNum(d.scans.failed)}`} />
            {d.donations && <Stat label={`Donations (${d.donations.count})`} value={fmtMoney(d.donations.total)} tone="green" />}
            {d.expenses && <Stat label={`Expenses (${d.expenses.count})`} value={fmtMoney(d.expenses.total)} tone="red" />}
            {d.balance !== null && <Stat label="Balance" value={fmtMoney(d.balance)} />}
          </div>
          {d.restricted.length > 0 && <p className="text-xs text-slate-500">Hidden for your role: {d.restricted.map(humanize).join(', ')}.</p>}
        </div>
      )}
    </Loader>
  );
}

function TokensView({ range }: { range: Range }) {
  const q = useReport<TokensReport>('tokens', range);
  return (
    <Loader q={q}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Total" value={fmtNum(d.total)} />
            <Stat label="Active" value={fmtNum(d.active)} tone="green" />
            <Stat label="Used" value={fmtNum(d.used)} />
            <Stat label="Expired" value={fmtNum(d.expired)} tone="amber" />
            <Stat label="Cancelled" value={fmtNum(d.cancelled)} tone="red" />
            <Stat label="Not yet valid" value={fmtNum(d.notYetValid)} />
          </div>
          <Card>
            <Table head={['Slot', 'Total', 'Used', 'Active', 'Expired', 'Cancelled']}>
              {d.bySlot.map((s) => (
                <tr key={s.timeSlotId ?? s.label}>
                  <Td className="font-semibold">{s.label}</Td>
                  <Td>{fmtNum(s.total)}</Td>
                  <Td>{fmtNum(s.used)}</Td>
                  <Td>{fmtNum(s.active)}</Td>
                  <Td>{fmtNum(s.expired)}</Td>
                  <Td>{fmtNum(s.cancelled)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </Loader>
  );
}

function VisitorsView({ range }: { range: Range }) {
  const q = useReport<VisitorsReport>('visitors', range);
  return (
    <Loader q={q}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Visitors" value={fmtNum(d.totalVisitors)} tone="brand" />
            <Stat label="Entries" value={fmtNum(d.totalEntries)} tone="green" />
          </div>
          <Card>
            <h3 className="mb-2 font-bold">By hour</h3>
            <BarChart label="Visitors by hour" data={d.byHour.map((h) => ({ key: String(h.hour), label: fmtHour(h.hour), value: h.visitors }))} />
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">By date</h3>
            <BarChart label="Visitors by date" data={d.byDate.map((x) => ({ key: x.date, label: x.date.slice(5), value: x.visitors }))} />
            <Table head={['Date', 'Entries', 'Visitors']}>
              {d.byDate.map((x) => (
                <tr key={x.date}>
                  <Td>{fmtDate(x.date)}</Td>
                  <Td>{fmtNum(x.entries)}</Td>
                  <Td>{fmtNum(x.visitors)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">By slot</h3>
            <Table head={['Slot', 'Entries', 'Visitors']}>
              {d.bySlot.map((s) => (
                <tr key={s.timeSlotId ?? s.label}>
                  <Td className="font-semibold">{s.label}</Td>
                  <Td>{fmtNum(s.entries)}</Td>
                  <Td>{fmtNum(s.visitors)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </Loader>
  );
}

function ScansView({ range }: { range: Range }) {
  const q = useReport<ScansReport>('scans', range);
  return (
    <Loader q={q}>
      {(d) => (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total" value={fmtNum(d.total)} />
          <Stat label="Success" value={fmtNum(d.success)} tone="green" />
          <Stat label="Already used" value={fmtNum(d.alreadyUsed)} tone="red" />
          <Stat label="Expired" value={fmtNum(d.expired)} tone="amber" />
          <Stat label="Not yet valid" value={fmtNum(d.notYetValid)} tone="amber" />
          <Stat label="Cancelled" value={fmtNum(d.cancelled)} tone="red" />
          <Stat label="Invalid" value={fmtNum(d.invalid)} tone="red" />
          <Stat label="Wrong event" value={fmtNum(d.wrongEvent)} tone="red" />
          <Stat label="Unauthorized" value={fmtNum(d.unauthorized)} tone="red" />
        </div>
      )}
    </Loader>
  );
}

function VolunteersView({ range }: { range: Range }) {
  const ev = useEvent();
  const q = useReport<VolunteerStats[]>('volunteers', range);
  return (
    <Loader q={q}>
      {(d) =>
        d.length === 0 ? (
          <Empty title="No volunteer scans yet" />
        ) : (
          <Card>
            <Table head={['Volunteer', 'Total', 'OK', 'Dup', 'Expired', 'Early', 'Invalid', 'Other', 'Last active']}>
              {d.map((v) => (
                <tr key={v.userId}>
                  <Td className="font-semibold">{v.name}</Td>
                  <Td>{fmtNum(v.total)}</Td>
                  <Td className="text-green-700">{fmtNum(v.successful)}</Td>
                  <Td>{fmtNum(v.duplicate)}</Td>
                  <Td>{fmtNum(v.expired)}</Td>
                  <Td>{fmtNum(v.notYetValid)}</Td>
                  <Td>{fmtNum(v.invalid)}</Td>
                  <Td>{fmtNum(v.other)}</Td>
                  <Td>{fmtDateTime(v.lastActiveAt, ev.timezone)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        )
      }
    </Loader>
  );
}

function FinanceView({ range }: { range: Range }) {
  const q = useReport<FinanceReport>('finance', range);
  return (
    <Loader q={q}>
      {(d) => (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={`Donations (${d.donations.count})`} value={fmtMoney(d.donations.total)} tone="green" />
            <Stat label={`Expenses (${d.expenses.count})`} value={fmtMoney(d.expenses.total)} tone="red" />
            <Stat label="Balance" value={fmtMoney(d.balance)} />
            <Stat label="Pending donations" value={typeof d.donations.pending === 'number' ? fmtNum(d.donations.pending) : fmtMoney(d.donations.pending)} tone="amber" />
          </div>
          <Card>
            <h3 className="mb-2 font-bold">Donations by method</h3>
            <Table head={['Method', 'Count', 'Total']}>
              {d.donations.byMethod.map((m) => (
                <tr key={m.method}>
                  <Td>{humanize(m.method)}</Td>
                  <Td>{fmtNum(m.count)}</Td>
                  <Td>{fmtMoney(m.total)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card>
            <h3 className="mb-2 font-bold">Expenses by category</h3>
            <Table head={['Category', 'Count', 'Total']}>
              {d.expenses.byCategory.map((c) => (
                <tr key={c.category}>
                  <Td>{humanize(c.category)}</Td>
                  <Td>{fmtNum(c.count)}</Td>
                  <Td>{fmtMoney(c.total)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </Loader>
  );
}
