'use client';

import { useEffect, useState } from 'react';
import { Hourglass } from 'lucide-react';
import { onSlowServer } from '@/lib/booking';
import { useT } from '@/lib/i18n/provider';

/** True while any public booking request has been waiting more than a few seconds. */
export function useSlowServer(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => onSlowServer(setSlow), []);
  return slow;
}

/** Friendly banner shown instead of a silent skeleton while the API wakes from sleep. */
export function SlowServerNotice({ className }: { className?: string }) {
  const slow = useSlowServer();
  const { t } = useT();
  if (!slow) return null;
  return (
    <p role="status" aria-live="polite" className={`no-print flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ${className ?? ''}`}>
      <Hourglass aria-hidden className="h-4 w-4 shrink-0 animate-pulse text-amber-600" />
      {t('common.wakingUp')}
    </p>
  );
}
