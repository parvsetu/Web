'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Alert, Button, Field, LabeledInput, LabeledSelect, Modal, Textarea, cx } from '../ui';

/** A small modal asking for a note / reason before an audited action. */
export function TextActionModal({
  title, label, placeholder, confirm, danger, onClose, onSubmit,
}: {
  title: string; label: string; placeholder?: string; confirm: string; danger?: boolean; onClose: () => void; onSubmit: (text: string) => Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <Field label={label}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={1000} autoFocus />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button
          variant={danger ? 'danger' : 'primary'}
          loading={busy}
          disabled={text.trim().length < 3}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onSubmit(text.trim());
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirm}
        </Button>
      </div>
    </Modal>
  );
}

/** Super admin records a fee paid outside the gateway (cash / bank transfer). */
export function MarkPaidModal({ eventId, eventName, amount, onClose, onDone }: { eventId: string; eventName: string; amount: string | null; onClose: () => void; onDone: () => void }) {
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH'>('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`Mark paid — ${eventName}`}>
      <div className="flex flex-col gap-4">
        {amount && <p className="text-sm text-slate-600">Fee: <strong>₹{amount}</strong>. The festival goes live immediately.</p>}
        <LabeledSelect label="Paid by" value={method} onChange={(e) => setMethod(e.target.value as 'BANK_TRANSFER' | 'CASH')}>
          <option value="BANK_TRANSFER">Bank transfer / UPI</option>
          <option value="CASH">Cash</option>
        </LabeledSelect>
        <LabeledInput label="Reference (UTR / receipt no.)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} />
        <LabeledInput label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {error && <Alert>{error}</Alert>}
        <Button
          variant="success"
          loading={busy}
          disabled={reference.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.post(`/platform/events/${eventId}/fee/mark-paid`, { method, reference: reference.trim(), note: note.trim() || undefined });
              onDone();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Mark paid &amp; publish
        </Button>
      </div>
    </Modal>
  );
}

/** Pill filter row (wraps on phones, never scrolls). */
export function StatusPills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx(
            'min-h-[40px] rounded-full px-3.5 text-sm font-semibold transition',
            value === o.key ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
