'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { accountPushEnabled, disablePush, enableAccountPush, pushSupport, type PushSupport } from '@/lib/push';
import { Alert, Button, Card } from './ui';

/**
 * Profile → "Notifications on this phone": new Instagram photos to review,
 * blogger approvals, stall booking changes… Each phone/browser is switched on
 * separately. On iPhone it needs Parvsetu on the home screen first.
 */
export function NotificationsCard() {
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const s = pushSupport();
    setSupport(s);
    if (s === 'ok') accountPushEnabled().then(setOn).catch(() => setOn(false));
  }, []);

  if (!support) return null;
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Bell aria-hidden className="h-5 w-5 text-orange-500" /> Notifications on this phone</h2>
      <p className="text-sm text-slate-600">Get an alert when something needs you — new Instagram photos to review, a festival promotion approved, a stall booking changed.</p>
      {support === 'needs-install' && <Alert kind="info">On iPhone, first add Parvsetu to your home screen (Share → Add to Home Screen), open it from there, and switch notifications on here.</Alert>}
      {support === 'unsupported' && <Alert kind="info">This browser can’t show notifications.</Alert>}
      {support === 'denied' && <Alert kind="warning">Notifications are blocked for this site in your phone or browser settings. Allow them there, then come back.</Alert>}
      {support === 'ok' && on !== null && (
        on ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-emerald-700">On for this phone</span>
            <Button variant="secondary" size="sm" loading={busy} onClick={async () => {
              setBusy(true);
              await disablePush();
              setOn(false);
              setBusy(false);
            }}><BellOff aria-hidden className="h-4 w-4" /> Turn off</Button>
          </div>
        ) : (
          <Button loading={busy} onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await enableAccountPush();
              setOn(true);
            } catch (e) {
              const m = e instanceof Error ? e.message : '';
              if (m === 'denied') setSupport('denied');
              else if (m !== 'dismissed') setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}><Bell aria-hidden className="h-4 w-4" /> Turn on notifications</Button>
        )
      )}
      {error && <Alert>{error}</Alert>}
    </Card>
  );
}
