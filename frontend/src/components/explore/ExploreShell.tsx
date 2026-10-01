'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, LayoutDashboard, LogIn, MapPin, Search, Ticket, X } from 'lucide-react';
import { LogoMark } from '../FestivalArt';
import { Modal } from '../ui';
import { CATEGORIES } from '@/lib/explore';
import { CityPicker } from './CityPicker';
import { cx } from '@/lib/cx';
import { getToken } from '@/lib/api';
import { DASHBOARD, homeFor, useAuth } from '@/lib/auth';

/**
 * Header for the public explore experience: brand, search, city picker and the
 * category strip. Search and city live in the URL, so links are shareable.
 */
export function ExploreShell({
  children,
  city,
  onCity,
  q,
  onQ,
  cat,
  onCat,
  cityCounts,
  allCities,
}: {
  children: ReactNode;
  city: string;
  onCity: (c: string) => void;
  q: string;
  onQ: (q: string) => void;
  cat: string;
  onCat: (c: string) => void;
  /** Bookable-event count per city (lower-cased key). */
  cityCounts: Map<string, number>;
  /** Every city we know of, grouped by state. */
  allCities: { state: string; cities: string[] }[];
}) {
  const [picker, setPicker] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const { me } = useAuth();
  // Read the session only after mount, so the server HTML and first client render match.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!getToken()), [me]);
  const dashboard = me ? homeFor(me) : DASHBOARD;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f7f5f2]">
      <header className="no-print sticky top-0 z-30 bg-white pt-safe shadow-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Parvsetu home">
            <LogoMark className="h-9 w-9" />
            <span className="hidden text-xl font-extrabold tracking-tight text-slate-900 sm:inline">Parvsetu</span>
          </Link>
          <label className="relative hidden min-w-0 flex-1 md:block">
            <span className="sr-only">Search events</span>
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => onQ(e.target.value)}
              placeholder="Search festivals, melas, exhibitions, mandals…"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-3 text-[15px] outline-none focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-100"
            />
          </label>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <button type="button" aria-label="Search" onClick={() => setMobileSearch((v) => !v)} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 md:hidden">
              {mobileSearch ? <X aria-hidden className="h-5 w-5" /> : <Search aria-hidden className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="inline-flex min-h-[44px] max-w-[9.5rem] items-center gap-1 rounded-xl px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              aria-haspopup="dialog"
            >
              <MapPin aria-hidden className="h-4 w-4 shrink-0 text-rose-500" />
              <span className="truncate">{city || 'All cities'}</span>
              <ChevronDown aria-hidden className="h-4 w-4 shrink-0" />
            </button>
            <Link href="/book/my-passes" className="hidden min-h-[44px] items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">
              <Ticket aria-hidden className="h-4 w-4" /> My passes
            </Link>
            {signedIn ? (
              <Link href={dashboard} className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
                <LayoutDashboard aria-hidden className="h-4 w-4" /> <span className="hidden sm:inline">My dashboard</span><span className="sm:hidden">Dashboard</span>
              </Link>
            ) : (
              <Link href="/login" className="inline-flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-rose-500 px-3 text-sm font-semibold text-white shadow-sm hover:bg-rose-600">
                <LogIn aria-hidden className="h-4 w-4" /> <span className="hidden sm:inline">Organiser login</span><span className="sm:hidden">Login</span>
              </Link>
            )}
          </div>
        </div>
        {mobileSearch && (
          <div className="px-4 pb-3 md:hidden">
            <label className="relative block">
              <span className="sr-only">Search events</span>
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                autoFocus
                value={q}
                onChange={(e) => onQ(e.target.value)}
                placeholder="Search events or mandals"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-3 outline-none focus:border-rose-300 focus:bg-white focus:ring-4 focus:ring-rose-100"
              />
            </label>
          </div>
        )}
        <nav aria-label="Categories" className="relative border-t border-slate-100 bg-slate-50/80">
          {/* Phones: one swipeable row with an edge fade. lg+: everything fits, wrapping if the window is narrow. */}
          <div className="mx-auto flex max-w-6xl gap-0.5 overflow-x-auto px-3 pr-10 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible lg:pr-3 [&::-webkit-scrollbar]:hidden">
            {[{ key: '', label: 'All events', emoji: '🎉' }, ...CATEGORIES].map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={cat === c.key}
                onClick={() => onCat(c.key)}
                className={cx(
                  'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium',
                  cat === c.key ? 'border-rose-500 text-rose-600' : 'border-transparent text-slate-600 hover:text-slate-900',
                )}
              >
                <span aria-hidden>{c.emoji}</span> {'short' in c && c.short ? c.short : c.label}
              </button>
            ))}
          </div>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l from-slate-50 via-slate-50/90 to-transparent pr-2 text-slate-400 lg:hidden">
            <ChevronRight className="h-4 w-4" />
          </span>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>

      <footer className="no-print bg-slate-900 text-slate-300">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-white">
              <LogoMark className="h-7 w-7" />
              <span className="text-lg font-extrabold">Parvsetu</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">Passes for festivals, melas, kathas, exhibitions and community events across India.</p>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Visitors</span>
            <Link href="/" className="hover:text-white">Explore events</Link>
            <Link href="/book/my-passes" className="hover:text-white">My passes</Link>
            <Link href="/faq#visitors" className="hover:text-white">Help</Link>
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Organisers</span>
            <Link href="/login" className="hover:text-white">Mandal login</Link>
            <Link href="/register?type=mandal" className="hover:text-white">Register your mandal</Link>
            <Link href="/legal/content-policy" className="hover:text-white">Content policy</Link>
            <Link href="/faq" className="inline-flex items-center gap-1 hover:text-white"><HelpCircle aria-hidden className="h-4 w-4" /> Help &amp; FAQ</Link>
            <a href="mailto:parvsetu@gmail.com" className="break-words hover:text-white">List your event — parvsetu@gmail.com</a>
          </div>
        </div>
        <p className="border-t border-slate-800 py-4 text-center text-xs text-slate-500">© {new Date().getFullYear()} Parvsetu</p>
      </footer>

      <CityPicker
        open={picker}
        onClose={() => setPicker(false)}
        current={city}
        counts={cityCounts}
        allCities={allCities}
        onPick={(c) => {
          onCity(c);
          setPicker(false);
        }}
      />
    </div>
  );
}
