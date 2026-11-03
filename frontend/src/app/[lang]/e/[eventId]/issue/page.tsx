'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
import { clampDate, fmtMoney, humanize, todayIn } from '@/lib/format';
import { useAsync } from '@/lib/hooks';
import { can } from '@/lib/permissions';
import type { TimeSlot, TokenWithQr } from '@/lib/types';
import { AppShell } from '@/components/AppShell';
import { EventGate } from '@/components/EventGate';
import {
  TokenShareButtons,
  TokenTicket,
  ValidityPicker,
  VisitorCountInput,
  buildValidity,
  initialValidity,
  type ValidityState,
} from '@/components/TokenParts';
import { Clock, Drama, Plus, Printer, QrCode, Ticket, UserRound, Users } from 'lucide-react';
import { Alert, Button, Card, LabeledInput, SectionTitle, SkeletonList, cx } from '@/components/ui';

/** A ticketed programme the desk can sell on a date (GET desk-tickets). */
interface DeskTicket {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  stage: string | null;
  /** Per person, peak rules applied — what the desk collects. */
  price: string;
  basePrice: string;
  ruleLabel: string | null;
  cancelled: boolean;
  ended: boolean;
  /** null = no seat limit. */
  remaining: number | null;
}
import { CreditBanner, IssueAllowance, type EventAllowance } from '@/components/org/CreditTab';
import { PrintFormatPicker, PrintFormatStyle, type PrintFormat } from '@/components/PrintFormat';
import type { SponsorPublic } from '@/components/SponsorStrip';

export default function IssuePage() {
  const ev = useEvent();
  return (
    <AppShell festivalType={ev.festivalType} title="Issue token" subtitle={ev.name} back={`/e/${ev.eventId}`}>
      <EventGate anyOf={['TOKEN_CREATE']} liveOnly>
        {ev.status && ev.status !== 'ACTIVE' ? (
          <Alert kind="warning">
            {ev.status === 'DRAFT'
              ? 'Tokens can be issued only after the mandal admin makes this festival Active.'
              : `Tokens cannot be issued for a ${humanize(ev.status).toLowerCase()} festival.`}{' '}
            <Link href={`/e/${ev.eventId}`} className="underline">Go back</Link>
          </Alert>
        ) : (
          <IssueForm />
        )}
      </EventGate>
    </AppShell>
  );
}

function IssueForm() {
  const ev = useEvent();
  const allowCustom = can(ev.perms, 'TOKEN_GENERATE');
  const slots = useAsync(() => api.get<TimeSlot[]>(`/events/${ev.eventId}/time-slots`), [ev.eventId]);
  const [validity, setValidity] = useState<ValidityState | null>(null);
  // Entry pass (time slot / custom validity) or a ticket for one ticketed programme.
  const [kind, setKind] = useState<'pass' | 'ticket'>('pass');
  const [ticketDate, setTicketDate] = useState(() => clampDate(todayIn(ev.timezone), ev.startDate, ev.endDate));
  const [ticketId, setTicketId] = useState<string | null>(null);
  const tickets = useAsync(() => api.get<DeskTicket[]>(`/events/${ev.eventId}/desk-tickets`, { date: ticketDate }), [ev.eventId, ticketDate]);
  const ticket = tickets.data?.find((x) => x.id === ticketId) ?? null;
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<TokenWithQr[] | null>(null);
  const [perPerson, setPerPerson] = useState(true);
  // The platform decides the layout per mandal; the server resolves it per pass (AUTO counts the ads).
  const [printFormat, setPrintFormat] = useState<PrintFormat>('THERMAL_80');
  const maxVisitors = ev.detail?.maxVisitorsPerToken ?? 10;
  const credit = useAsync(() => api.get<EventAllowance>(`/events/${ev.eventId}/credit-status`), [ev.eventId, issued?.length ?? 0]);
  const sponsors = useAsync(() => api.get<SponsorPublic[]>(`/events/${ev.eventId}/sponsors`), [ev.eventId]);

  useEffect(() => {
    if (slots.data && !validity) setValidity(initialValidity(slots.data, ev.startDate, ev.endDate, ev.timezone));
  }, [slots.data, validity, ev.startDate, ev.endDate, ev.timezone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validity) return;
    setError(null);
    let v: Record<string, unknown> | string;
    if (kind === 'ticket') {
      if (!ticket) return setError('Pick the programme this ticket is for.');
      if (ticket.remaining !== null && ticket.remaining < count) return setError(`Only ${ticket.remaining} ${ticket.remaining === 1 ? 'place is' : 'places are'} left for ${ticket.title}.`);
      v = { programmeItemId: ticket.id };
    } else {
      v = buildValidity(validity);
    }
    if (typeof v === 'string') return setError(v);
    if (mobile && !/^\+?\d{10,13}$/.test(mobile.replace(/\s/g, ''))) return setError('Enter a valid mobile number or leave it empty.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...v, visitorCount: count, ...(count > 1 ? { perPerson } : {}) };
      if (name.trim()) body.visitorName = name.trim();
      if (mobile.trim()) body.visitorMobile = mobile.replace(/\s/g, '');
      const res = await api.post<TokenWithQr | { count: number; tokens: TokenWithQr[] }>(`/events/${ev.eventId}/tokens`, body);
      const list = 'tokens' in res ? res.tokens : [res];
      setIssued(list);
      if (list[0]?.printFormat) setPrintFormat(list[0].printFormat);
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setIssued(null);
    setName('');
    setMobile('');
    setCount(1);
    setError(null);
  }

  if (issued) {
    return (
      <div className="flex flex-col gap-4">
        <Alert kind="success">
          {issued.length > 1
            ? `${issued.length} passes issued — one QR per person. Each can be used once.`
            : 'Token issued. Show or print this QR for the visitor.'}
        </Alert>
        <PrintFormatStyle format={printFormat} />
        <div className="no-print rounded-2xl border border-orange-100 bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Print as</p>
          <PrintFormatPicker value={printFormat} onChange={setPrintFormat} />
        </div>
        {issued.map((t, i) => (
          <div key={t.id} className="flex flex-col gap-2">
            {issued.length > 1 && <div className="text-center text-sm font-bold text-orange-800">Pass {i + 1} of {issued.length}</div>}
            <TokenTicket token={t} eventName={ev.name} tz={ev.timezone} festivalType={ev.festivalType} sponsors={(sponsors.data ?? []).filter((s) => t.sponsorIds?.includes(s.id))} />
            <TokenShareButtons token={t} eventName={ev.name} tz={ev.timezone} showPrint={issued.length === 1} />
          </div>
        ))}
        {issued.length > 1 && (
          <Button variant="secondary" className="no-print" onClick={() => window.print()}>
            <Printer aria-hidden className="h-5 w-5" /> Print all {issued.length} passes
          </Button>
        )}
        <Button size="lg" onClick={another} className="no-print">
          <Plus aria-hidden className="h-6 w-6" /> Issue another
        </Button>
      </div>
    );
  }

  if (slots.loading || !validity) return <SkeletonList rows={3} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <CreditBanner status={credit.data} orgId={ev.organization?.id} />
      <IssueAllowance data={credit.data} />
      {slots.error && <Alert>{slots.error}</Alert>}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="What to issue">
        {(['pass', 'ticket'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cx(
              'flex min-h-[56px] items-center justify-center gap-2 rounded-xl border px-2 text-sm font-semibold',
              kind === k ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-400' : 'border-orange-200 bg-white',
            )}
          >
            {k === 'pass' ? <Clock aria-hidden className="h-5 w-5" /> : <Drama aria-hidden className="h-5 w-5" />}
            {k === 'pass' ? 'Entry pass' : 'Programme ticket'}
          </button>
        ))}
      </div>
      {kind === 'pass' ? (
        <>
          <SectionTitle icon={Clock}>When can they enter?</SectionTitle>
          <Card>
            <ValidityPicker
              value={validity}
              onChange={setValidity}
              slots={slots.data ?? []}
              allowCustom={allowCustom}
              durationOptions={ev.detail?.tokenDurationOptions ?? []}
              startDate={ev.startDate}
              endDate={ev.endDate}
              tz={ev.timezone}
            />
          </Card>
        </>
      ) : (
        <>
          <SectionTitle icon={Drama}>Which programme?</SectionTitle>
          <Card className="flex flex-col gap-3">
            <LabeledInput
              label="Date"
              type="date"
              value={ticketDate}
              min={ev.startDate.slice(0, 10)}
              max={ev.endDate.slice(0, 10)}
              onChange={(e) => { setTicketDate(e.target.value); setTicketId(null); }}
            />
            {tickets.error && <Alert>{tickets.error}</Alert>}
            {tickets.loading && !tickets.data ? (
              <SkeletonList rows={2} />
            ) : (tickets.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No ticketed programmes on this day. The organiser sets them up under Programme (“Sell tickets for this programme”).</p>
            ) : (
              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Programme">
                {tickets.data!.map((x) => {
                  const off = x.cancelled || x.ended || x.remaining === 0;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={ticketId === x.id}
                      disabled={off}
                      onClick={() => setTicketId(x.id)}
                      className={cx(
                        'flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm',
                        ticketId === x.id ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-400' : 'border-orange-200 bg-white',
                        off && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{x.title}</span>
                        <span className="block text-xs text-slate-500">
                          {x.startTime}–{x.endTime}{x.stage ? ` · ${x.stage}` : ''}
                          {x.cancelled ? ' · cancelled' : x.ended ? ' · over' : x.remaining === null ? '' : ` · ${x.remaining} left`}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold tabular-nums">{Number(x.price) > 0 ? fmtMoney(x.price) : 'Free'}</span>
                        {x.ruleLabel && <span className="block text-[11px] font-semibold text-amber-700">{x.ruleLabel}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
      <SectionTitle icon={UserRound}>Visitor</SectionTitle>
      <Card className="flex flex-col gap-4">
        <VisitorCountInput value={count} onChange={setCount} max={maxVisitors} />
        {count > 1 && (
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="QR codes">
            {[true, false].map((pp) => (
              <button
                key={String(pp)}
                type="button"
                role="radio"
                aria-checked={perPerson === pp}
                onClick={() => setPerPerson(pp)}
                className={cx(
                  'flex min-h-[64px] flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold',
                  perPerson === pp ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-400' : 'border-orange-200 bg-white',
                )}
              >
                {pp ? <QrCode aria-hidden className="h-5 w-5" /> : <Users aria-hidden className="h-5 w-5" />}
                {pp ? `${count} QR codes (1 each)` : '1 group QR'}
              </button>
            ))}
          </div>
        )}
        <LabeledInput label="Visitor name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <LabeledInput label="Visitor mobile (optional)" type="tel" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" />
      </Card>
      {kind === 'ticket' && ticket && Number(ticket.price) > 0 && (
        <Alert kind="info">Collect {fmtMoney((Number(ticket.price) * count).toFixed(2))} ({count} × {fmtMoney(ticket.price)}) before handing over the ticket.</Alert>
      )}
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy} disabled={credit.data?.state === 'EXHAUSTED'}>
        {!busy && <Ticket aria-hidden className="h-6 w-6" />}
        {kind === 'ticket' ? 'Issue ticket' : 'Issue token'}
      </Button>
    </form>
  );
}
