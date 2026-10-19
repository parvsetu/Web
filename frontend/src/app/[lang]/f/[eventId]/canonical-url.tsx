'use client';

import { useEffect } from 'react';

/**
 * An old /f/<id> (or old address) link shows the festival's current address in
 * the browser bar, keeping ?ref= / ?lang= and #day-… — no reload, no redirect
 * (the page is cached, so it can't redirect on the query string server-side).
 */
export function CanonicalUrl({ path }: { path: string }) {
  useEffect(() => {
    try {
      const { pathname, search, hash } = window.location;
      if (decodeURIComponent(pathname) !== path) window.history.replaceState(window.history.state, '', `${path}${search}${hash}`);
    } catch {
      /* ignore */
    }
  }, [path]);
  return null;
}
