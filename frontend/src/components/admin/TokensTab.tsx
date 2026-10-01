'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { fmtDateTime } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { Paged, TimeSlot, Token, TokenDetail, TokenWithQr } from '@/lib/types';
import { QrImage } from '../QrImage';
import { ScanRowCard } from '../ScanRow';
import {
  SlotSelect,
  TokenShareButtons,
  ValidityPicker,
  VisitorCountInput,
  buildValidity,
  initialValidity,
  type ValidityState,
} from '../TokenParts';
import { Ban, CalendarClock, Layers, Printer, RotateCcw } from 'lucide-react';
import { PrintFormatPicker, PrintFormatStyle, type PrintFormat } from '../PrintFormat';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  LabeledInput,
  LabeledSelect,
  Modal,
  Pager,
  SectionTitle,
  SkeletonList,
  Textarea,
} from '../ui';

const PAGE_SIZE = 25;

export function TokensTab() {
  const ev = useEvent();
  const canView = can(ev.perms, 'TOKEN_VIEW');
  const canBulk = can(ev.perms, 'TOKEN_GENERATE');
  const [filters, setFilters] = useState({ status: '', timeSlotId: '', date: '', q: '' });
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [sheet, setSheet] = useState<TokenWithQr[] | null>(null);

  const slots = useAsync(() => api.get<TimeSlot[]>(`/events/${ev.eventId}/time-slots`), [ev.eventId]);
  const list = useAsync(
    () => api.get<Paged<Token>>(`/events/${ev.eventId}/tokens`, { ...filters, page, pageSize: PAGE_SIZE }),
    [ev.eventId, filters, page],
    canView,
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const setF = (k: keyof typeof filters) => (v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  if (sheet) return <PrintSheet tokens={sheet} onClose={() => setSheet(null)} />;

  return (
    <div className="flex flex-col gap-4">
      {canBulk && (
        <div className="flex justify-end">
          <Button onClick={() => setBulkOpen(true)}><Layers aria-hidden className="h-4 w-4" /> Bulk generate</Button>
        </div>
      )}
      {canView ? (
        <>
          <Card className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <LabeledInput label="Search" placeholder="Code, name or mobile" value={qInput} onChange={(e) => setQInput(e.target.value)} />
            </div>
            <LabeledSelect label="Status" value={filters.status} onChange={(e) => setF('status')(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="USED">Used</option>
              <option value="EXPIRED">Expired</option>
              <option value="CANCELLED">Cancelled</option>
            </LabeledSelect>
            <SlotSelect slots={slots.data ?? []} value={filters.timeSlotId} onChange={setF('timeSlotId')} />
            <LabeledInput label="Date" type="date" value={filters.date} onChange={(e) => setF('date')(e.target.value)} />
          </Card>
          {list.error && <Alert>{list.error}</Alert>}
          {list.loading && !list.data ? (
            <SkeletonList />
          ) : list.data && list.data.items.length > 0 ? (
            <div className="flex flex-col gap-2">
              {list.data.items.map((t) => (
                <button key={t.id} type="button" onClick={() => setOpenId(t.id)} className="text-left">
                  <Card className="py-3 transition-colors hover:border-brand-500">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{t.tokenCode}</span>
                      <Badge value={t.effectiveStatus} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      {t.timeSlot && <span>{t.timeSlot.label}</span>}
                      <span>
                        {fmtDateTime(t.validFrom, ev.timezone)} – {fmtDateTime(t.validUntil, ev.timezone)}
                      </span>
                      <span>{t.visitorCount} ppl</span>
                      {t.visitor?.name && <span>{t.visitor.name}</span>}
                    </div>
                  </Card>
                </button>
              ))}
              <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
            </div>
          ) : (
            <Empty title="No tokens match" />
          )}
        </>
      ) : (
        <Alert kind="info">You can generate tokens, but not view the token list.</Alert>
      )}

      {openId && (
        <TokenDrawer
          tokenId={openId}
          slots={slots.data ?? []}
          onClose={() => setOpenId(null)}
          onChanged={list.reload}
        />
      )}
      {bulkOpen && (
        <BulkModal
          slots={slots.data ?? []}
          onClose={() => setBulkOpen(false)}
          onDone={(tokens) => {
            setBulkOpen(false);
            setSheet(tokens);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function TokenDrawer({ tokenId, slots, onClose, onChanged }: { tokenId: string; slots: TimeSlot[]; onClose: () => void; onChanged: () => void }) {
  const ev = useEvent();
  const q = useAsync(() => api.get<TokenDetail>(`/events/${ev.eventId}/tokens/${tokenId}`), [ev.eventId, tokenId]);
  const [action, setAction] = useState<'cancel' | 'validity' | 'reactivate' | null>(null);
  const t = q.data;

  const done = () => {
    setAction(null);
    q.reload();
    onChanged();
  };

  return (
    <Modal open onClose={onClose} title={t?.tokenCode ?? 'Token'} wide>
      {q.loading && !t ? (
        <SkeletonList rows={3} />
      ) : q.error ? (
        <Alert>{q.error}</Alert>
      ) : t ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2">
            <QrImage payload={t.qrPayload} size={220} />
            <Badge value={t.effectiveStatus} />
          </div>
          <TokenShareButtons token={t} eventName={ev.name} tz={ev.timezone} showPrint={false} />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Dt>Slot</Dt>
            <Dd>{t.timeSlot?.label ?? 'Custom'}</Dd>
            <Dt>Valid from</Dt>
            <Dd>{fmtDateTime(t.validFrom, ev.timezone)}</Dd>
            <Dt>Valid until</Dt>
            <Dd>{fmtDateTime(t.validUntil, ev.timezone)}</Dd>
            <Dt>People</Dt>
            <Dd>{t.visitorCount}</Dd>
            <Dt>Visitor</Dt>
            <Dd>{t.visitor ? [t.visitor.name, t.visitor.mobile].filter(Boolean).join(' · ') || '—' : '—'}</Dd>
            <Dt>Issued</Dt>
            <Dd>
              {fmtDateTime(t.issuedAt, ev.timezone)}
              {t.issuedBy ? ` by ${t.issuedBy.name}` : ''}
            </Dd>
            {t.usedAt && (
              <>
                <Dt>Used</Dt>
                <Dd>
                  {fmtDateTime(t.usedAt, ev.timezone)}
                  {t.usedBy ? ` by ${t.usedBy.name}` : ''}
                </Dd>
              </>
            )}
            {t.cancelledAt && (
              <>
                <Dt>Cancelled</Dt>
                <Dd>
                  {fmtDateTime(t.cancelledAt, ev.timezone)}
                  {t.cancellationReason ? ` — ${t.cancellationReason}` : ''}
                </Dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-2">
            {t.status === 'ACTIVE' && can(ev.perms, 'TOKEN_CANCEL') && (
              <Button variant="danger" size="sm" onClick={() => setAction('cancel')}>
                <Ban aria-hidden className="h-4 w-4" /> Cancel token
              </Button>
            )}
            {t.status === 'ACTIVE' && can(ev.perms, 'TOKEN_GENERATE') && (
              <Button variant="secondary" size="sm" onClick={() => setAction('validity')}>
                <CalendarClock aria-hidden className="h-4 w-4" /> Change validity
              </Button>
            )}
            {t.status === 'USED' && can(ev.perms, 'TOKEN_REACTIVATE') && (
              <Button variant="secondary" size="sm" onClick={() => setAction('reactivate')}>
                <RotateCcw aria-hidden className="h-4 w-4" /> Reactivate (recovery)
              </Button>
            )}
          </div>

          {action === 'cancel' && <CancelForm token={t} onDone={done} onCancel={() => setAction(null)} />}
          {action === 'validity' && <ValidityForm token={t} slots={slots} onDone={done} onCancel={() => setAction(null)} />}
          {action === 'reactivate' && <ReactivateForm token={t} onDone={done} onCancel={() => setAction(null)} />}

          <SectionTitle>Scan history</SectionTitle>
          {t.scans.length === 0 ? (
            <Empty title="Never scanned" />
          ) : (
            <div className="flex flex-col gap-2">
              {t.scans.map((s) => (
                <ScanRowCard key={s.id} row={s} tz={ev.timezone} showUser />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return <dt className="text-slate-500">{children}</dt>;
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd className="font-medium text-slate-900">{children}</dd>;
}

function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
      <h3 className="mb-3 font-bold">{title}</h3>
      {children}
    </div>
  );
}

function CancelForm({ token, onDone, onCancel }: { token: Token; onDone: () => void; onCancel: () => void }) {
  const ev = useEvent();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Reason must be at least 3 characters.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${ev.eventId}/tokens/${token.id}/cancel`, { reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ActionBox title="Cancel this token">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Visitor lost the printed token" />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" variant="danger" loading={busy}>
            <Ban aria-hidden className="h-4 w-4" /> Cancel token
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </form>
    </ActionBox>
  );
}

function ValidityForm({ token, slots, onDone, onCancel }: { token: Token; slots: TimeSlot[]; onDone: () => void; onCancel: () => void }) {
  const ev = useEvent();
  const [v, setV] = useState<ValidityState>(() => ({
    ...initialValidity(slots, ev.startDate, ev.endDate, ev.timezone),
    timeSlotId: token.timeSlot?.id ?? slots.find((s) => s.isActive)?.id ?? '',
  }));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validity = buildValidity(v);
    if (typeof validity === 'string') return setError(validity);
    if (reason.trim().length < 3) return setError('Please give a reason.');
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/events/${ev.eventId}/tokens/${token.id}/validity`, { ...validity, reason: reason.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ActionBox title="Change validity">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <ValidityPicker value={v} onChange={setV} slots={slots} allowCustom startDate={ev.startDate} endDate={ev.endDate} tz={ev.timezone} />
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            Save validity
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </form>
    </ActionBox>
  );
}

function ReactivateForm({ token, onDone, onCancel }: { token: Token; onDone: () => void; onCancel: () => void }) {
  const ev = useEvent();
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const codeOk = code.trim() === token.tokenCode;
  const reasonOk = reason.trim().length >= 10;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeOk) return setError('The token code you typed does not match.');
    if (!reasonOk) return setError('Reason must be at least 10 characters.');
    setBusy(true);
    setError(null);
    try {
      await api.post(`/events/${ev.eventId}/tokens/${token.id}/reactivate`, { reason: reason.trim(), confirmTokenCode: code.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-4">
      <h3 className="mb-2 font-bold text-red-900">Reactivate a used token</h3>
      <p className="mb-3 text-sm text-red-900">
        This is an <strong>audited administrative recovery action</strong>. It voids the original successful entry and lets this token be
        scanned again. Only do this when an entry was recorded by mistake. Your name and reason will be saved in the audit log.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={`Type the token code to confirm: ${token.tokenCode}`}>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Reason (at least 10 characters)">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" variant="danger" loading={busy} disabled={!codeOk || !reasonOk}>
            <RotateCcw aria-hidden className="h-4 w-4" /> Reactivate token
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        </div>
      </form>
    </div>
  );
}

function BulkModal({ slots, onClose, onDone }: { slots: TimeSlot[]; onClose: () => void; onDone: (t: TokenWithQr[]) => void }) {
  const ev = useEvent();
  const [v, setV] = useState<ValidityState>(() => initialValidity(slots, ev.startDate, ev.endDate, ev.timezone));
  const [count, setCount] = useState(20);
  const [visitors, setVisitors] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const validity = buildValidity(v);
    if (typeof validity === 'string') return setError(validity);
    if (!Number.isInteger(count) || count < 1 || count > 1000) return setError('Count must be between 1 and 1000.');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ count: number; tokens: TokenWithQr[] }>(`/events/${ev.eventId}/tokens/bulk`, {
        ...validity,
        count,
        visitorCount: visitors,
      });
      onDone(res.tokens);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Bulk generate tokens">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <LabeledInput label="How many tokens" type="number" min={1} max={1000} value={count} onChange={(e) => setCount(Number(e.target.value))} />
        <VisitorCountInput value={visitors} onChange={setVisitors} max={ev.detail?.maxVisitorsPerToken ?? 10} />
        <ValidityPicker value={v} onChange={setV} slots={slots} allowCustom startDate={ev.startDate} endDate={ev.endDate} tz={ev.timezone} />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" size="lg" loading={busy}>
          Generate {count > 0 ? count : ''} tokens
        </Button>
      </form>
    </Modal>
  );
}

function PrintSheet({ tokens, onClose }: { tokens: TokenWithQr[]; onClose: () => void }) {
  const ev = useEvent();
  const [format, setFormat] = useState<PrintFormat>(ev.detail?.passPrintFormat ?? 'A4');
  const thermal = format !== 'A4';
  return (
    <div className="flex flex-col gap-4">
      {thermal ? <PrintFormatStyle format={format} /> : <style media="print">{'@page { size: A4; margin: 10mm; }'}</style>}
      <PrintFormatPicker value={format} onChange={setFormat} />
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Alert kind="success">{tokens.length} tokens generated.</Alert>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}><Printer aria-hidden className="h-4 w-4" /> Print sheet</Button>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
      <div className={thermal ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 print:block' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2'}>
        {tokens.map((t) => (
          <div key={t.id} className={thermal ? 'pass-print' : 'print-break-inside-avoid'}>
            <SmallTicket token={t} eventName={ev.name} tz={ev.timezone} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SmallTicket({ token, eventName, tz }: { token: TokenWithQr; eventName: string; tz: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-500 bg-white p-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">{eventName}</div>
      <QrImage payload={token.qrPayload} size={160} />
      <div className="font-mono text-sm font-bold">{token.tokenCode}</div>
      <div className="text-[10px] leading-tight text-slate-700">
        {token.timeSlot?.label ? `${token.timeSlot.label} · ` : ''}
        {fmtDateTime(token.validFrom, tz)} – {fmtDateTime(token.validUntil, tz)}
      </div>
      {token.visitorCount > 1 && <div className="text-[10px] font-semibold">Admits {token.visitorCount}</div>}
    </div>
  );
}

