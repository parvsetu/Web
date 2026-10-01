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
import { Clock, Plus, Ticket, UserRound } from 'lucide-react';
import { Alert, Button, Card, LabeledInput, SectionTitle, SkeletonList } from '@/components/ui';

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
  const [issued, setIssued] = useState<TokenWithQr | null>(null);
  const maxVisitors = ev.detail?.maxVisitorsPerToken ?? 10;

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
      const body: Record<string, unknown> = { ...v, visitorCount: count };
      if (name.trim()) body.visitorName = name.trim();
      if (mobile.trim()) body.visitorMobile = mobile.replace(/\s/g, '');
      const token = await api.post<TokenWithQr>(`/events/${ev.eventId}/tokens`, body);
      setIssued(token);
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
        <Alert kind="success">Token issued. Show or print this QR for the visitor.</Alert>
        <TokenTicket token={issued} eventName={ev.name} tz={ev.timezone} festivalType={ev.festivalType} />
        <TokenShareButtons token={issued} eventName={ev.name} tz={ev.timezone} />
        <Button size="lg" onClick={another} className="no-print">
          <Plus aria-hidden className="h-6 w-6" /> Issue another
        </Button>
      </div>
    );
  }

  if (slots.loading || !validity) return <SkeletonList rows={3} />;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
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
          startDate={ev.startDate}
          endDate={ev.endDate}
          tz={ev.timezone}
        />
      </Card>
      <SectionTitle icon={UserRound}>Visitor</SectionTitle>
      <Card className="flex flex-col gap-4">
        <VisitorCountInput value={count} onChange={setCount} max={maxVisitors} />
        <LabeledInput label="Visitor name (optional)" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <LabeledInput label="Visitor mobile (optional)" type="tel" inputMode="numeric" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="off" />
      </Card>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
        {!busy && <Ticket aria-hidden className="h-6 w-6" />}
        Issue token
      </Button>
    </form>
  );
}
