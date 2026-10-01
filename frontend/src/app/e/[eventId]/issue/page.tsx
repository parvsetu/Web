'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useEvent } from '@/lib/event-context';
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
import { Clock, Plus, Printer, QrCode, Ticket, UserRound, Users } from 'lucide-react';
import { Alert, Button, Card, LabeledInput, SectionTitle, SkeletonList, cx } from '@/components/ui';
import { CreditBanner, type CreditStatus } from '@/components/org/CreditTab';
import { PrintFormatPicker, PrintFormatStyle, type PrintFormat } from '@/components/PrintFormat';
import type { SponsorPublic } from '@/components/SponsorStrip';

export default function IssuePage() {
  const ev = useEvent();
  return (
    <AppShell festivalType={ev.festivalType} title="Issue token" subtitle={ev.name} back={`/e/${ev.eventId}`}>
      <EventGate anyOf={['TOKEN_CREATE']}>
        <IssueForm />
      </EventGate>
    </AppShell>
  );
}

function IssueForm() {
  const ev = useEvent();
  const allowCustom = can(ev.perms, 'TOKEN_GENERATE');
  const slots = useAsync(() => api.get<TimeSlot[]>(`/events/${ev.eventId}/time-slots`), [ev.eventId]);
  const [validity, setValidity] = useState<ValidityState | null>(null);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [count, setCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<TokenWithQr[] | null>(null);
  const [perPerson, setPerPerson] = useState(true);
  const [printFormat, setPrintFormat] = useState<PrintFormat>(ev.detail?.passPrintFormat ?? 'A4');
  const maxVisitors = ev.detail?.maxVisitorsPerToken ?? 10;
  const credit = useAsync(() => api.get<CreditStatus>(`/events/${ev.eventId}/credit-status`), [ev.eventId, issued?.length ?? 0]);
  const sponsors = useAsync(() => api.get<SponsorPublic[]>(`/events/${ev.eventId}/sponsors`), [ev.eventId]);

  useEffect(() => {
    if (slots.data && !validity) setValidity(initialValidity(slots.data, ev.startDate, ev.endDate, ev.timezone));
  }, [slots.data, validity, ev.startDate, ev.endDate, ev.timezone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validity) return;
    setError(null);
    const v = buildValidity(validity);
    if (typeof v === 'string') return setError(v);
    if (mobile && !/^\+?\d{10,13}$/.test(mobile.replace(/\s/g, ''))) return setError('Enter a valid mobile number or leave it empty.');
    setBusy(true);
    try {
      const body: Record<string, unknown> = { ...v, visitorCount: count, ...(count > 1 ? { perPerson } : {}) };
      if (name.trim()) body.visitorName = name.trim();
      if (mobile.trim()) body.visitorMobile = mobile.replace(/\s/g, '');
      const res = await api.post<TokenWithQr | { count: number; tokens: TokenWithQr[] }>(`/events/${ev.eventId}/tokens`, body);
      setIssued('tokens' in res ? res.tokens : [res]);
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
      {slots.error && <Alert>{slots.error}</Alert>}
      {ev.status && ev.status !== 'ACTIVE' && ev.status !== 'DRAFT' && (
        <Alert kind="warning">Tokens can only be issued for Draft or Active festivals.</Alert>
      )}
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
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy} disabled={credit.data?.state === 'EXHAUSTED'}>
        {!busy && <Ticket aria-hidden className="h-6 w-6" />}
        Issue token
      </Button>
    </form>
  );
}
