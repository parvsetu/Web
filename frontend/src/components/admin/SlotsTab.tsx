'use client';

import { fmtMoney } from '@/lib/format';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { useAsync } from '@/lib/hooks';
import type { TimeSlot } from '@/lib/types';
import { Alert, Badge, Button, Card, Checkbox, Empty, LabeledInput, Modal, SkeletonList } from '../ui';
import { Pencil, Plus, Trash2 } from 'lucide-react';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function SlotsTab() {
  const ev = useEvent();
  const q = useAsync(() => api.get<TimeSlot[]>(`/events/${ev.eventId}/time-slots`), [ev.eventId]);
  const [editing, setEditing] = useState<TimeSlot | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(s: TimeSlot) {
    if (!window.confirm(`Remove slot "${s.label}"? If tokens already use it, it will be deactivated instead.`)) return;
    setError(null);
    try {
      await api.del(`/events/${ev.eventId}/time-slots/${s.id}`);
      q.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const sorted = [...(q.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime));

  return (
    <div className="flex flex-col gap-4">
      <Alert kind="info">
        Time slots set the entry window for new tokens. Changing a slot does <strong>not</strong> change tokens already issued — each
        token keeps its own window. To change one token, open it in the Tokens tab.
      </Alert>
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')}><Plus aria-hidden className="h-4 w-4" /> Add slot</Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {q.error && <Alert>{q.error}</Alert>}
      {q.loading && !q.data ? (
        <SkeletonList />
      ) : sorted.length === 0 ? (
        <Empty title="No time slots yet">Add slots like “Morning 06:00–12:00”.</Empty>
      ) : (
        sorted.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{s.label}</span>
                <Badge value={s.isActive ? 'ACTIVE' : 'INACTIVE'} />
                {s.crossesMidnight && <Badge className="bg-indigo-100 text-indigo-800">Crosses midnight</Badge>}
              </div>
              <div className="text-sm text-slate-600">
                {s.startTime} – {s.endTime}
                {s.capacity ? ` · capacity ${s.capacity}` : ''}
                {' · '}
                <span className="font-semibold text-emerald-700">{Number(s.price ?? 0) > 0 ? `${fmtMoney(s.price)} / person` : 'Free'}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(s)}>
                <Pencil aria-hidden className="h-4 w-4" /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-red-700" onClick={() => remove(s)}>
                <Trash2 aria-hidden className="h-4 w-4" /> Remove
              </Button>
            </div>
          </Card>
        ))
      )}
      {editing && (
        <SlotForm
          slot={editing === 'new' ? null : editing}
          nextSort={(sorted.at(-1)?.sortOrder ?? 0) + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            q.reload();
          }}
        />
      )}
    </div>
  );
}

function SlotForm({ slot, nextSort, onClose, onSaved }: { slot: TimeSlot | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const ev = useEvent();
  const [label, setLabel] = useState(slot?.label ?? '');
  const [startTime, setStart] = useState(slot?.startTime ?? '');
  const [endTime, setEnd] = useState(slot?.endTime ?? '');
  const [capacity, setCapacity] = useState(slot?.capacity ? String(slot.capacity) : '');
  const [price, setPrice] = useState(slot?.price && Number(slot.price) > 0 ? String(Number(slot.price)) : '');
  const [isActive, setActive] = useState(slot?.isActive ?? true);
  const [sortOrder, setSort] = useState(String(slot?.sortOrder ?? nextSort));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const crosses = HHMM.test(startTime) && HHMM.test(endTime) && endTime <= startTime;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!label.trim()) return setError('Enter a label.');
    if (!HHMM.test(startTime) || !HHMM.test(endTime)) return setError('Times must be HH:mm (24-hour), e.g. 18:30.');
    if (startTime === endTime) return setError('Start and end time cannot be the same.');
    if (capacity && (!/^\d+$/.test(capacity) || Number(capacity) < 1)) return setError('Capacity must be a positive number or empty.');
    if (price && !/^\d{1,8}(\.\d{1,2})?$/.test(price)) return setError('Price must be an amount like 50 or 99.50 (empty = free).');
    const body = {
      label: label.trim(),
      startTime,
      endTime,
      capacity: capacity ? Number(capacity) : null,
      price: price || '0',
      isActive,
      sortOrder: Number(sortOrder) || 0,
    };
    setBusy(true);
    try {
      if (slot) await api.patch(`/events/${ev.eventId}/time-slots/${slot.id}`, body);
      else await api.post(`/events/${ev.eventId}/time-slots`, body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={slot ? 'Edit slot' : 'Add slot'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Evening aarti" />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Start (HH:mm)" type="time" value={startTime} onChange={(e) => setStart(e.target.value)} />
          <LabeledInput label="End (HH:mm)" type="time" value={endTime} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {crosses && <p className="text-sm text-indigo-800">This slot crosses midnight — it ends the next day.</p>}
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Capacity (optional)" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <LabeledInput label="Pass price per person (₹)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0 = free" hint="Used for online booking" />
          <LabeledInput label="Sort order" type="number" value={sortOrder} onChange={(e) => setSort(e.target.value)} />
        </div>
        <Checkbox label="Active (can be used for new tokens)" checked={isActive} onChange={setActive} />
        {slot && <p className="text-xs text-slate-500">Saving does not change tokens already issued for this slot.</p>}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>
          Save slot
        </Button>
      </form>
    </Modal>
  );
}
