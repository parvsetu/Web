'use client';

import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { fmtLongDateTimeL } from '@/lib/i18n/format';
import { useT } from '@/lib/i18n/provider';
import { useSalesState, type SalesState } from '@/lib/sales-window';
import { BookLink } from './book-link';

/**
 * The festival page's Book button, respecting the mandal's online sales window:
 * before it opens a "Passes on sale from …" notice, after it closes a short note.
 */
export function SalesGate(props: {
  eventId: string; opensAt: string | null; closesAt: string | null; initial: SalesState; timezone: string; className: string; children: ReactNode;
}) {
  const { t, locale } = useT();
  const state = useSalesState(props.opensAt, props.closesAt, props.initial);
  if (state === 'OPEN') return <BookLink eventId={props.eventId} className={props.className}>{props.children}</BookLink>;
  return (
    <div className="flex min-h-[64px] items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-3 text-center font-bold text-orange-900">
      <CalendarClock aria-hidden className="h-6 w-6 shrink-0" />
      {state === 'NOT_YET' ? t('sales.from', { when: fmtLongDateTimeL(props.opensAt!, props.timezone, locale) }) : t('sales.closed')}
    </div>
  );
}
