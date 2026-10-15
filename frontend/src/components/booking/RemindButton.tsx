'use client';

import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import { markReminded, pushSupport, remindMeAboutPass, remindedOrders, type PushSupport } from '@/lib/push';
import { Alert, Button } from '../ui';

/** Pass page: "Remind me before my slot" (web push; on iPhone after Add to Home Screen). */
export function RemindButton({ orderId, accessKey, validUntil }: { orderId: string; accessKey: string; validUntil: string }) {
  const { t, lang } = useT();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupport(pushSupport());
    setOn(remindedOrders().includes(orderId));
  }, [orderId]);

  if (!support || support === 'unsupported' || new Date(validUntil) <= new Date()) return null;
  if (on) return <p className="no-print flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700"><BellRing aria-hidden className="h-4 w-4" /> {t('remind.on')}</p>;
  if (support === 'needs-install') return <p className="no-print rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-600"><Bell aria-hidden className="mr-1 inline h-3.5 w-3.5" />{t('remind.needsInstall')}</p>;
  if (support === 'denied') return <p className="no-print text-center text-xs text-slate-500">{t('remind.denied')}</p>;

  return (
    <div className="no-print flex flex-col gap-2">
      <Button variant="secondary" loading={busy} onClick={async () => {
        setBusy(true);
        setError(null);
        try {
          await remindMeAboutPass(orderId, accessKey, lang);
          markReminded(orderId);
          setOn(true);
        } catch (e) {
          const m = e instanceof Error ? e.message : '';
          if (m === 'denied') setSupport('denied');
          else if (m !== 'dismissed') setError(t('remind.error'));
        } finally {
          setBusy(false);
        }
      }}>
        <Bell aria-hidden className="h-4 w-4" /> {t('remind.button')}
      </Button>
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
