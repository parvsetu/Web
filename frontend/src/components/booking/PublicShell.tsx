import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogIn, Ticket } from 'lucide-react';
import { LogoMark } from '../FestivalArt';
import { cx } from '@/lib/cx';

/**
 * Layout for the public (no-login) booking pages: brand header, content,
 * footer. Header/footer are hidden when printing so a pass prints alone.
 */
export function PublicShell({ children, wide, bottomPad }: { children: ReactNode; wide?: boolean; bottomPad?: boolean }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-orange-100/80 bg-[#fffaf3]/90 pt-safe backdrop-blur">
        <div className={cx('mx-auto flex h-14 items-center gap-2 px-4', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <Link href="/book" className="flex min-h-[44px] items-center gap-2 rounded-xl pr-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30">
            <LogoMark className="h-8 w-8" />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Parvsetu</span>
          </Link>
          <nav aria-label="Booking" className="ml-auto flex items-center gap-1">
            <Link
              href="/book/my-passes"
              className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-50"
            >
              <Ticket aria-hidden className="h-4 w-4" />
              My passes
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold text-slate-600 hover:bg-orange-50"
            >
              <LogIn aria-hidden className="h-4 w-4" />
              <span>
                Organiser<span className="hidden sm:inline"> login</span>
              </span>
            </Link>
          </nav>
        </div>
      </header>

      <main className={cx('mx-auto w-full flex-1 px-4 py-4', wide ? 'max-w-5xl' : 'max-w-2xl', bottomPad && 'pb-36')}>{children}</main>

      <footer className={cx('no-print border-t border-orange-100 bg-white/60', bottomPad && 'mb-28')}>
        <div className={cx('mx-auto flex flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <div className="flex items-center gap-2">
            <LogoMark className="h-5 w-5" />
            <span className="font-semibold text-slate-700">Parvsetu</span>
            <span>· Festival passes</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto">
            <Link href="/book" className="hover:text-orange-700">
              Browse festivals
            </Link>
            <Link href="/book/my-passes" className="hover:text-orange-700">
              My passes
            </Link>
            <Link href="/login" className="hover:text-orange-700">
              For organisers
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
