'use client';

import { useState } from 'react';
import { BellRing, ChevronDown, Inbox } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { cx } from '@/lib/cx';
import { NotificationsCard } from '../NotificationsCard';
import { Alert, Button, Card, LabeledInput } from '../ui';

export interface PendingCounts {
  registrations: number; reviews: number; reported: number; payouts: number; tax: number; partners: number; bloggers: number; total: number;
}

/** [one, many] */
const LABEL: Record<Exclude<keyof PendingCounts, 'total'>, [string, string]> = {
  registrations: ['mandal registration', 'mandal registrations'], reviews: ['festival review', 'festival reviews'], reported: ['reported review', 'reported reviews'],
  payouts: ['payout / KYC check', 'payout / KYC checks'], tax: ['80G check', '80G checks'], partners: ['partner request', 'partner requests'], bloggers: ['blogger request', 'blogger requests'],
};

/**
 * Top of the Platform console: what's waiting (click to jump there) and how super
 * admins get told about new items — email to every super admin plus the extra
 * addresses below, and a phone push where notifications are switched on.
 */
export function PlatformAlertsBar({ counts, onOpen }: { counts: PendingCounts | null; onOpen: (tab: string) => void }) {
  const [open, setOpen] = useState(false);
  const items = counts ? (Object.keys(LABEL) as (keyof typeof LABEL)[]).filter((k) => counts[k] > 0) : [];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <Inbox aria-hidden className="h-5 w-5 text-orange-600" />
          {counts === null ? 'Checking what’s waiting…' : counts.total === 0 ? 'Nothing waiting for review — all clear.' : `Waiting for you: ${counts.total}`}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <BellRing aria-hidden className="h-4 w-4" /> How I’m notified <ChevronDown aria-hidden className={cx('h-4 w-4 transition', open && 'rotate-180')} />
        </Button>
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((k) => (
            <button key={k} type="button" onClick={() => onOpen(k)} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-800 ring-1 ring-rose-200 hover:bg-rose-100">
              {counts![k]} {LABEL[k][counts![k] === 1 ? 0 : 1]}
            </button>
          ))}
        </div>
      )}
      {open && <AlertSettings />}
    </Card>
  );
}

function AlertSettings() {
  const q = useAsync(() => api.get<{ alertEmails: string }>('/platform/alert-settings'), []);
  const [value, setValue] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = value ?? q.data?.alertEmails ?? '';

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.put<{ alertEmails: string }>('/platform/alert-settings', { alertEmails: current });
      setValue(r.alertEmails);
      setMsg({ ok: true, text: 'Saved.' });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 text-sm">
      <p className="text-slate-600">
        Within about 2 minutes of a new mandal registration, festival submitted for review, payout / 80G details, partner or blogger request,
        or reported review, every super admin gets <strong>one email</strong> listing what&apos;s new — and a <strong>phone notification</strong> on
        any phone where notifications are switched on below.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1">
          <LabeledInput label="Also email (optional)" value={current} onChange={(e) => setValue(e.target.value)} placeholder="ops@yourteam.in, support@yourteam.in" hint="Comma-separated, e.g. a team inbox." />
        </div>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
      {msg && <Alert kind={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      <NotificationsCard description="Get a phone alert the moment something is waiting for review — new mandals, festivals, KYC, 80G, partner and blogger requests, reported reviews." />
    </div>
  );
}
