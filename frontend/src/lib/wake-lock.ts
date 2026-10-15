'use client';

import { useEffect } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

/**
 * Keeps the phone's screen on while `active` (e.g. the gate scanner is open).
 * Supported on iOS 16.4+ and Chrome; silently does nothing elsewhere. The
 * browser drops the lock when the page is hidden, so it is re-taken whenever
 * the page becomes visible again.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!active || !wl) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const take = async () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await wl.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* battery saver, or not allowed — the scanner still works */
      }
    };
    void take();
    const onVis = () => void take();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
