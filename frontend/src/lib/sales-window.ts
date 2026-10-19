'use client';

import { useEffect, useState } from 'react';

export type SalesState = 'NOT_YET' | 'OPEN' | 'CLOSED';

/** Same rule as the API (common/booking-window.ts): null ends are open. */
export function salesStateAt(opensAt: string | null | undefined, closesAt: string | null | undefined, now = Date.now()): SalesState {
  if (opensAt && now < new Date(opensAt).getTime()) return 'NOT_YET';
  if (closesAt && now >= new Date(closesAt).getTime()) return 'CLOSED';
  return 'OPEN';
}

/**
 * Sales state worked out in the browser and re-checked every 30 s, so a cached
 * festival page flips to "Book" right when sales open (the server re-checks on order).
 * Before mount it returns `initial` (the server's answer) to avoid a hydration flash.
 */
export function useSalesState(opensAt: string | null | undefined, closesAt: string | null | undefined, initial: SalesState = 'OPEN'): SalesState {
  const [state, setState] = useState<SalesState>(initial);
  useEffect(() => {
    const tick = () => setState(salesStateAt(opensAt, closesAt));
    tick();
    if (!opensAt && !closesAt) return;
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [opensAt, closesAt]);
  return state;
}
