'use client';

import { useState } from 'react';
import {
  ArrowDownCircle, ArrowUpCircle, FileDown, HandCoins, Landmark, Pencil, PieChart, Plus, ReceiptIndianRupee, Save, Scale, Ticket, TrendingDown, TrendingUp,
} from 'lucide-react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { fmtDate, fmtMoney, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { useOrg } from '@/lib/org-context';
import { usePagedList } from '@/lib/paged';
import { can } from '@/lib/permissions';
import type { Expense } from '@/lib/types';
import { ExpenseCategoryList } from '../admin/ExpensesTab';
import { FestivalBadge } from '../FestivalBanner';
import { SearchBar } from '../SearchBar';
import { Alert, Button, Card, Empty, LabeledInput, LabeledSelect, Modal, Pager, SectionTitle, SkeletonList, Stat, Table, Td, cx } from '../ui';
import { useOrgEvents } from './shared';

interface AnnualReport {
  year: number;
  basis: 'calendar' | 'financial';
  label: string;
  from: string;
  to: string;
  income: { total: string; donations: string; passSales: string; donationCount: number; passOrderCount: number };
  expenses: { total: string; count: number };
  net: string;
  result: 'PROFIT' | 'LOSS' | 'BREAK_EVEN';
  byMonth: { month: string; label: string; income: string; expenses: string; net: string }[];
  byEvent: { eventId: string | null; name: string; festivalType: string | null; donations: string; passSales: string; expenses: string; net: string }[];
  byCategory: { category: string; total: string }[];
}

type OrgExpense = Expense & { eventId?: string | null; event?: { id: string; name: string } | null };

const TZ = 'Asia/Kolkata';

export function AccountsTab() {
  const org = useOrg();
  const thisYear = Number(todayIn(TZ).slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [basis, setBasis] = useState<'calendar' | 'financial'>('calendar');
  const canReport = can(org.perms, 'REPORT_VIEW') && can(org.perms, 'DONATION_VIEW') && can(org.perms, 'EXPENSE_VIEW');
  const report = useAsync(
    () => api.get<AnnualReport>(`/organizations/${org.orgId}/reports/annual`, { year, basis }),
    [org.orgId, year, basis],
    canReport,
  );
  const years = Array.from({ length: 6 }, (_, i) => thisYear + 1 - i);

  return (
    <div className="flex flex-col gap-4">
      {canReport && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <LabeledSelect label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {basis === 'financial' ? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}` : y}
                  </option>
                ))}
              </LabeledSelect>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-orange-100/60 p-1" role="radiogroup" aria-label="Year type">
              {(['calendar', 'financial'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={basis === b}
                  onClick={() => setBasis(b)}
                  className={cx('min-h-[40px] rounded-lg px-3 text-sm font-semibold', basis === b ? 'bg-white text-orange-800 shadow' : 'text-slate-600')}
                >
                  {b === 'calendar' ? 'Jan – Dec' : 'Apr – Mar (FY)'}
                </button>
              ))}
            </div>
            {can(org.perms, 'REPORT_EXPORT') && (
              <Button
                variant="secondary"
                onClick={() => void downloadFile(`/organizations/${org.orgId}/reports/annual`, { year, basis, format: 'csv' }, `profit-loss-${year}.csv`)}
              >
                <FileDown aria-hidden className="h-4 w-4" /> Export CSV
              </Button>
            )}
          </div>
          {report.error && <Alert>{report.error}</Alert>}
          {report.loading && !report.data ? <SkeletonList rows={3} /> : report.data && <ProfitLoss r={report.data} />}
        </>
      )}
      <ExpenseLedger />
    </div>
  );
}

function ProfitLoss({ r }: { r: AnnualReport }) {
  const net = Number(r.net);
  const profit = r.result === 'PROFIT';
  const loss = r.result === 'LOSS';
  const maxMonth = Math.max(1, ...r.byMonth.flatMap((m) => [Number(m.income), Number(m.expenses)]));
  const maxCat = Math.max(1, ...r.byCategory.map((c) => Number(c.total)));
  return (
    <>
      <section
        className={cx(
          'relative overflow-hidden rounded-3xl p-5 text-white shadow-lg',
          profit ? 'bg-gradient-to-br from-emerald-500 to-green-700' : loss ? 'bg-gradient-to-br from-rose-500 to-red-700' : 'bg-gradient-to-br from-slate-500 to-slate-700',
        )}
      >
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-2 ring-white/40">
            {profit ? <TrendingUp aria-hidden className="h-9 w-9" /> : loss ? <TrendingDown aria-hidden className="h-9 w-9" /> : <Scale aria-hidden className="h-9 w-9" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              {r.label} · {fmtDate(r.from)} – {fmtDate(r.to)}
            </p>
            <p className="text-3xl font-black">{profit ? 'Profit' : loss ? 'Loss' : 'Break-even'} {fmtMoney(Math.abs(net))}</p>
            <p className="text-sm text-white/90">
              Income {fmtMoney(r.income.total)} − Expenses {fmtMoney(r.expenses.total)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total income" value={fmtMoney(r.income.total)} tone="green" icon={ArrowDownCircle} />
        <Stat label="Total expenses" value={fmtMoney(r.expenses.total)} tone="red" icon={ArrowUpCircle} />
        <Stat label={`Donations (${r.income.donationCount})`} value={fmtMoney(r.income.donations)} tone="brand" icon={HandCoins} />
        <Stat label={`Pass sales (${r.income.passOrderCount})`} value={fmtMoney(r.income.passSales)} tone="purple" icon={Ticket} />
      </div>

      <SectionTitle icon={Landmark}>Month by month</SectionTitle>
      <Card>
        <div className="flex h-48 items-end gap-1.5 overflow-x-auto pb-1">
          {r.byMonth.map((m) => (
            <div key={m.month} className="flex h-full min-w-[34px] flex-1 flex-col items-center justify-end gap-1" title={`${m.label}: income ${fmtMoney(m.income)}, expenses ${fmtMoney(m.expenses)}`}>
              <div className="flex h-full w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-gradient-to-t from-emerald-600 to-emerald-300" style={{ height: `${(Number(m.income) / maxMonth) * 100}%`, minHeight: Number(m.income) ? 3 : 0 }} />
                <div className="w-1/2 rounded-t bg-gradient-to-t from-rose-600 to-rose-300" style={{ height: `${(Number(m.expenses) / maxMonth) * 100}%`, minHeight: Number(m.expenses) ? 3 : 0 }} />
              </div>
              <span className="text-[10px] text-slate-500">{m.label.slice(0, 3)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Income</span>
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Expenses</span>
        </div>
      </Card>

      <SectionTitle icon={Ticket}>By festival</SectionTitle>
      {r.byEvent.length === 0 ? (
        <Empty title="No income or expenses in this period" />
      ) : (
        <Card>
          <Table head={['Festival', 'Donations', 'Pass sales', 'Expenses', 'Net']}>
            {r.byEvent.map((e) => (
              <tr key={e.eventId ?? 'general'}>
                <Td>
                  <span className="flex items-center gap-2 font-semibold">
                    {e.eventId ? <FestivalBadge type={e.festivalType} className="h-8 w-8" /> : <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100"><Landmark aria-hidden className="h-4 w-4 text-slate-500" /></span>}
                    {e.name}
                  </span>
                </Td>
                <Td>{fmtMoney(e.donations)}</Td>
                <Td>{fmtMoney(e.passSales)}</Td>
                <Td className="text-red-700">{fmtMoney(e.expenses)}</Td>
                <Td className={cx('font-bold', Number(e.net) < 0 ? 'text-red-700' : 'text-green-700')}>{fmtMoney(e.net)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {r.byCategory.length > 0 && (
        <>
          <SectionTitle icon={PieChart}>Where the money went</SectionTitle>
          <Card className="flex flex-col gap-2">
            {r.byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{c.category}</span>
                  <span className="font-semibold tabular-nums">{fmtMoney(c.total)}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-orange-50">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${(Number(c.total) / maxCat) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );
}

function ExpenseLedger() {
  const org = useOrg();
  const events = useOrgEvents(org.orgId);
  const [eventFilter, setEventFilter] = useState('');
  const list = usePagedList<OrgExpense>(`/organizations/${org.orgId}/expenses`, { eventId: eventFilter || undefined });
  const [editing, setEditing] = useState<OrgExpense | 'new' | null>(null);
  const totalAmount = (list.data as unknown as { totalAmount?: string } | null)?.totalAmount;

  return (
    <>
      <SectionTitle
        icon={ReceiptIndianRupee}
        action={can(org.perms, 'EXPENSE_CREATE') ? <Button onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add expense</Button> : undefined}
      >
        All expenses
      </SectionTitle>
      <SearchBar value={list.search} onChange={list.setSearch} placeholder="Search description, vendor or category" total={list.total}>
        <div className="sm:w-56">
          <LabeledSelect label="Festival" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            <option value="">All</option>
            <option value="none">General (mandal-wide)</option>
            {(events.data ?? []).map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </LabeledSelect>
        </div>
      </SearchBar>
      {totalAmount && <Stat label="Total of matching expenses" value={fmtMoney(totalAmount)} tone="red" icon={ReceiptIndianRupee} />}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.items.length === 0 ? (
        <Empty icon={ReceiptIndianRupee} title={list.searching ? 'No expenses match your search' : 'No expenses recorded'}>Add rent, electricity, decoration and every other cost to see your true profit or loss.</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {list.items.map((x) => (
            <Card key={x.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{x.description}</span>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">{x.category}</span>
                </div>
                <div className="text-xs text-slate-500">
                  {fmtDate(x.expenseDate)} · {x.event?.name ?? 'General (mandal-wide)'}
                  {x.vendor ? ` · ${x.vendor}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-bold tabular-nums text-red-700">{fmtMoney(x.amount)}</span>
                {can(org.perms, 'EXPENSE_UPDATE') && (
                  <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => setEditing(x)}>
                    <Pencil aria-hidden className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
      <ExpenseCategoryList />
      {editing && (
        <OrgExpenseModal
          expense={editing === 'new' ? null : editing}
          events={events.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function OrgExpenseModal({
  expense, events, onClose, onSaved,
}: {
  expense: OrgExpense | null;
  events: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const org = useOrg();
  const [form, setForm] = useState({
    category: expense?.category ?? '',
    description: expense?.description ?? '',
    amount: expense?.amount ? String(Number(expense.amount)) : '',
    expenseDate: expense?.expenseDate ?? todayIn(TZ),
    vendor: expense?.vendor ?? '',
    eventId: expense?.eventId ?? '',
    reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.category.trim() || !form.description.trim()) return setError('Enter a category and description.');
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) return setError('Enter a valid amount.');
    setBusy(true);
    try {
      const body = {
        category: form.category.trim(), description: form.description.trim(), amount: form.amount, expenseDate: form.expenseDate,
        vendor: form.vendor.trim() || undefined,
      };
      if (expense) await api.patch(`/organizations/${org.orgId}/expenses/${expense.id}`, { ...body, reason: form.reason.trim() || undefined });
      else await api.post(`/organizations/${org.orgId}/expenses`, { ...body, eventId: form.eventId || undefined });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {!expense && (
          <LabeledSelect label="For" value={form.eventId} onChange={set('eventId')}>
            <option value="">General (mandal-wide — rent, electricity…)</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </LabeledSelect>
        )}
        <LabeledInput label="Category" list="expense-cats" value={form.category} onChange={set('category')} placeholder="e.g. Rent" />
        <LabeledInput label="Description" value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={(e) => setForm((x) => ({ ...x, amount: e.target.value.replace(/[^\d.]/g, '') }))} />
          <LabeledInput label="Date" type="date" value={form.expenseDate} onChange={set('expenseDate')} />
        </div>
        <LabeledInput label="Vendor (optional)" value={form.vendor} onChange={set('vendor')} />
        {expense && <LabeledInput label="Reason for change (optional)" value={form.reason} onChange={set('reason')} hint="Recorded in the audit log." />}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          <Save aria-hidden className="h-4 w-4" /> Save
        </Button>
      </form>
    </Modal>
  );
}
