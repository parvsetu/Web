'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BadgeIndianRupee, Bell, BellRing, CalendarDays, ChevronRight, ClipboardCheck, Flag, Handshake, Landmark, Megaphone, type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cx } from '../ui';
import type { PendingCounts } from './PlatformAlertsBar';

type Tab = 'registrations' | 'reviews' | 'reported' | 'payouts' | 'tax' | 'partners' | 'bloggers';
interface WaitingItem { tab: Tab; title: string; detail: string; at: string }

const ICON: Record<Tab, [LucideIcon, string]> = {
  registrations: [ClipboardCheck, 'bg-emerald-100 text-emerald-700'],
  reviews: [CalendarDays, 'bg-orange-100 text-orange-700'],
  reported: [Flag, 'bg-rose-100 text-rose-700'],
  payouts: [BadgeIndianRupee, 'bg-sky-100 text-sky-700'],
  tax: [Landmark, 'bg-violet-100 text-violet-700'],
  partners: [Handshake, 'bg-fuchsia-100 text-fuchsia-700'],
  bloggers: [Megaphone, 'bg-pink-100 text-pink-700'],
};

const REFRESH_MS = 60_000;

function ago(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/**
 * Super admin's header bell: everything waiting in the Platform console
 * (registrations, festival reviews, KYC, 80G, partner / blogger requests,
 * reported reviews), newest first. Refreshes every minute and whenever the
 * tab comes back into view; tapping an item opens its Platform tab.
 */
export function PlatformBell() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ counts: PendingCounts; items: WaitingItem[] } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    api
      .get<{ counts: PendingCounts; items: WaitingItem[] }>('/platform/pending/items')
      .then((d) => {
        setData(d);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  const total = data?.counts.total ?? 0;

  function go(tab: string) {
    setOpen(false);
    // Already on the console: change the hash so it switches tab in place.
    if (pathname?.endsWith('/platform')) window.location.hash = tab;
    else router.push(`/platform#${tab}`);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={total ? `${total} item${total === 1 ? '' : 's'} waiting for review` : 'Nothing waiting for review'}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className="relative flex h-12 w-12 items-center justify-center rounded-full text-slate-700 hover:bg-orange-50"
      >
        {total ? <BellRing aria-hidden className="h-6 w-6 text-orange-600" /> : <Bell aria-hidden className="h-6 w-6" />}
        {total > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold leading-none text-white ring-2 ring-white">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40" />
            <span className="relative">{total > 99 ? '99+' : total}</span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+3.75rem)] z-50 flex max-h-[min(75vh,560px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-1 sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white px-4 py-3">
              <span className="font-bold text-slate-900">Waiting for review</span>
              {total > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{total}</span>}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!data && !failed && <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>}
              {failed && !data && <p className="px-4 py-6 text-center text-sm text-red-700">Couldn’t load pending items.</p>}
              {data && data.items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">All clear — nothing is waiting.</p>}
              {data?.items.map((i, n) => {
                const [Icon, tone] = ICON[i.tab] ?? ICON.reviews;
                return (
                  <button
                    key={`${i.tab}-${i.at}-${n}`}
                    type="button"
                    onClick={() => go(i.tab)}
                    className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-orange-50"
                  >
                    <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
                      <Icon aria-hidden className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold leading-snug text-slate-900">{i.title}</span>
                      {i.detail && <span className="block truncate text-xs text-slate-500">{i.detail}</span>}
                      <span className="block text-[11px] text-slate-400">{ago(i.at)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={() => go(data?.items[0]?.tab ?? 'registrations')} className="flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-50">
              Open the Platform console <ChevronRight aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
