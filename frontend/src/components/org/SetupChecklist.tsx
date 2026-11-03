'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, ListChecks } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { cx } from '@/lib/cx';
import { Alert, Button, Card } from '../ui';

type ChecklistLink = { kind: 'org'; tab: string } | { kind: 'event'; eventId: string; tab: string };

interface ChecklistStep {
  key: string;
  title: string;
  hint: string;
  done: boolean;
  optional: boolean;
  status?: string;
  link: ChecklistLink;
}

interface Checklist {
  steps: ChecklistStep[];
  done: number;
  total: number;
  /** Every required step done. */
  complete: boolean;
  dismissed: boolean;
  canDismiss: boolean;
}

/** Steps that wait on someone else (Parvsetu review) — not the admin's next move. */
const WAITING = new Set(['PENDING', 'SUBMITTED']);

/**
 * "Get your mandal ready" — first-login checklist on the mandal admin page. The
 * server works every step out from the data; hiding it is per member. It hides
 * itself once every required step is done.
 */
export function SetupChecklist({ orgId, onOpenTab }: { orgId: string; onOpenTab: (tab: string) => void }) {
  const q = useAsync(() => api.get<Checklist>(`/organizations/${orgId}/setup-checklist`), [orgId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = q.data;

  async function setDismissed(dismissed: boolean) {
    setBusy(true);
    setError(null);
    try {
      q.setData(await api.put<Checklist>(`/organizations/${orgId}/setup-checklist/dismissed`, { dismissed }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!c || c.complete) return null;
  if (c.dismissed) {
    return (
      <div className="no-print -mt-1 text-right">
        <button type="button" className="text-sm font-semibold text-orange-700 hover:underline" onClick={() => void setDismissed(false)} disabled={busy}>
          Show set-up checklist ({c.done}/{c.total})
        </button>
      </div>
    );
  }

  // The first required step not done (and not waiting on Parvsetu) is the one to do now.
  const next = c.steps.find((s) => !s.done && !s.optional && !WAITING.has(s.status ?? '')) ?? null;
  const pct = Math.round((c.done / c.total) * 100);

  return (
    <Card className="no-print flex flex-col gap-3 border-orange-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><ListChecks aria-hidden className="h-5 w-5 text-orange-500" /> Get your mandal ready</h2>
          <p className="text-sm text-slate-600">{c.done} of {c.total} done — follow the steps in order to go live.</p>
        </div>
        {c.canDismiss && (
          <Button size="sm" variant="ghost" loading={busy} onClick={() => void setDismissed(true)}>Hide</Button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-orange-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Set-up progress">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pct}%` }} />
      </div>
      {error && <Alert>{error}</Alert>}
      <ol className="flex flex-col divide-y divide-orange-50">
        {c.steps.map((s) => (
          <li key={s.key}>
            <StepRow step={s} current={next?.key === s.key} onOpenTab={onOpenTab} />
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepRow({ step: s, current, onOpenTab }: { step: ChecklistStep; current: boolean; onOpenTab: (tab: string) => void }) {
  const body = (
    <>
      {s.done ? <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-green-600" /> : <Circle aria-hidden className={cx('mt-0.5 h-5 w-5 shrink-0', current ? 'text-orange-500' : 'text-slate-300')} />}
      <span className="min-w-0 flex-1">
        <span className={cx('block font-semibold', s.done && 'text-slate-500 line-through decoration-slate-300')}>
          {s.title}
          {s.optional && <span className="ml-2 text-xs font-normal text-slate-500">optional</span>}
        </span>
        <span className="block text-sm text-slate-600">{s.hint}</span>
      </span>
      {!s.done && <ChevronRight aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}
    </>
  );
  const cls = cx('flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left', !s.done && 'hover:bg-orange-50', current && 'bg-orange-50/60');
  if (s.done) return <div className={cls}>{body}</div>;
  return s.link.kind === 'event' ? (
    <Link href={`/e/${s.link.eventId}/admin#${s.link.tab}`} className={cls}>{body}</Link>
  ) : (
    <button type="button" className={cls} onClick={() => onOpenTab((s.link as { tab: string }).tab)}>{body}</button>
  );
}
