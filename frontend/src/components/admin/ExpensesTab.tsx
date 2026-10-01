'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDate, fmtMoney, humanize, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { Expense, Paged } from '@/lib/types';
import { Alert, Button, Card, Empty, LabeledInput, Modal, Pager, SkeletonList, Stat } from '../ui';
import { Pencil, Plus } from 'lucide-react';

// Suggestions only — the server accepts the category string.
const CATEGORY_SUGGESTIONS = ['DECORATION', 'PANDAL', 'IDOL', 'PRASAD', 'SOUND_LIGHT', 'SECURITY', 'CLEANING', 'PRINTING', 'TRANSPORT', 'MISC'];

export function ExpensesTab() {
  const ev = useEvent();
  const [f, setF] = useState({ category: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const list = useAsync(() => api.get<Paged<Expense>>(`/events/${ev.eventId}/expenses`, { ...f, page }), [ev.eventId, f, page]);
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setPage(1);
  };
  const pageTotal = (list.data?.items ?? []).reduce((s, x) => s + Number(x.amount || 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {can(ev.perms, 'EXPENSE_CREATE') && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add expense</Button>
        </div>
      )}
      <Card className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <LabeledInput label="Category" list="expense-cats" value={f.category} onChange={(e) => set('category')(e.target.value.toUpperCase())} />
        </div>
        <LabeledInput label="From" type="date" value={f.from} onChange={(e) => set('from')(e.target.value)} />
        <LabeledInput label="To" type="date" value={f.to} onChange={(e) => set('to')(e.target.value)} />
      </Card>
      <datalist id="expense-cats">
        {CATEGORY_SUGGESTIONS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {list.data && list.data.items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Stat label={`Shown (${list.data.items.length})`} value={fmtMoney(pageTotal)} tone="red" />
          <Stat label="Matching expenses" value={list.data.total} />
        </div>
      )}
      {list.error && <Alert>{list.error}</Alert>}
      {list.loading && !list.data ? (
        <SkeletonList />
      ) : list.data && list.data.items.length > 0 ? (
        <div className="flex flex-col gap-2">
          {list.data.items.map((x) => (
            <Card key={x.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="font-bold">{x.description}</div>
                <div className="text-xs text-slate-500">
                  {humanize(x.category)} · {fmtDate(x.expenseDate)}
                  {x.vendor ? ` · ${x.vendor}` : ''}
                  {x.receiptRef ? ` · Bill ${x.receiptRef}` : ''}
                  {x.createdBy ? ` · by ${x.createdBy.name}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tabular-nums">{fmtMoney(x.amount)}</span>
                {can(ev.perms, 'EXPENSE_UPDATE') && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(x)}>
                    <Pencil aria-hidden className="h-4 w-4" /> Edit
                  </Button>
                )}
              </div>
            </Card>
          ))}
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </div>
      ) : (
        <Empty title="No expenses recorded" />
      )}
      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
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

function ExpenseForm({ expense, onClose, onDone }: { expense: Expense | null; onClose: () => void; onDone: () => void }) {
  const ev = useEvent();
  const [form, setForm] = useState({
    category: expense?.category ?? '',
    description: expense?.description ?? '',
    amount: expense?.amount ?? '',
    expenseDate: expense?.expenseDate?.slice(0, 10) ?? todayIn(ev.timezone),
    vendor: expense?.vendor ?? '',
    receiptRef: expense?.receiptRef ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.category.trim()) return setError('Enter a category.');
    if (!form.description.trim()) return setError('Enter a description.');
    if (!/^\d+(\.\d{1,2})?$/.test(String(form.amount)) || Number(form.amount) <= 0) return setError('Enter a valid amount.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expenseDate)) return setError('Choose a date.');
    const body: Record<string, unknown> = {
      category: form.category.trim().toUpperCase(),
      description: form.description.trim(),
      amount: Number(form.amount).toFixed(2),
      expenseDate: form.expenseDate,
      vendor: form.vendor.trim() || undefined,
      receiptRef: form.receiptRef.trim() || undefined,
    };
    setBusy(true);
    try {
      if (expense) await api.patch(`/events/${ev.eventId}/expenses/${expense.id}`, body);
      else await api.post(`/events/${ev.eventId}/expenses`, body);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Category" list="expense-cats" value={form.category} onChange={set('category')} placeholder="DECORATION" />
        <LabeledInput label="Description" value={form.description} onChange={set('description')} />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Amount (₹)" inputMode="decimal" value={form.amount} onChange={set('amount')} />
          <LabeledInput label="Date" type="date" value={form.expenseDate} onChange={set('expenseDate')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Vendor (optional)" value={form.vendor} onChange={set('vendor')} />
          <LabeledInput label="Bill / receipt no. (optional)" value={form.receiptRef} onChange={set('receiptRef')} />
        </div>
        {expense && <p className="text-xs text-slate-500">Edits are recorded in the audit log.</p>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Save expense
        </Button>
      </form>
    </Modal>
  );
}
