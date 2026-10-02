'use client';

import { useCallback, useRef } from 'react';
import { BookingError } from '@/lib/booking';
import { useT } from './provider';

/**
 * Localised text for a failed public booking request. Network, rate-limit and
 * server errors get our own (translated) wording; anything the server
 * explained itself (validation, "slot full", …) is shown as the server sent it.
 * The returned function is stable, so it can sit inside effects.
 */
export function useBookingErrorText(): (e: unknown) => string {
  const { t } = useT();
  const ref = useRef(t);
  ref.current = t;
  return useCallback((e: unknown) => {
    const t = ref.current;
    if (e instanceof BookingError) {
      if (e.status === 0) return e.code === 'TIMEOUT' ? t('err.timeout') : t('err.network');
      if (e.status === 429) return t('err.tooMany');
      if (e.status >= 500 && e.status !== 503) return t('err.server');
      if (e.message === 'Not found.') return t('err.notFound');
      if (e.message === 'Online payment is not available for this festival right now.') return t('err.noPayment');
      if (e.message === 'Something went wrong. Please try again.') return t('err.generic');
      return e.message;
    }
    if (e instanceof Error && e.message) return e.message;
    return t('err.generic');
  }, []);
}
