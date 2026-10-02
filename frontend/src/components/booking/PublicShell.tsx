'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogIn, Ticket } from 'lucide-react';
import { LogoMark } from '../FestivalArt';
import { cx } from '@/lib/cx';
import { useT } from '@/lib/i18n/provider';
import { LanguageLinks, LanguageMenu } from '../LanguageSwitcher';
import { SlowServerNotice } from '../SlowServerNotice';

/**
 * Layout for the public (no-login) booking pages: brand header, content,
 * footer. Header/footer are hidden when printing so a pass prints alone.
 */
export function PublicShell({ children, wide, bottomPad }: { children: ReactNode; wide?: boolean; bottomPad?: boolean }) {
  const { t } = useT();
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-orange-100/80 bg-[#fffaf3]/90 pt-safe backdrop-blur">
        <div className={cx('mx-auto flex h-14 items-center gap-2 px-4', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <Link href="/" aria-label={t('common.home')} className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl pr-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30">
            <LogoMark className="h-8 w-8" />
            <span className="text-lg font-extrabold tracking-tight text-slate-900">Parvsetu</span>
          </Link>
          <nav aria-label={t('header.bookingNav')} className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1">
            <Link
              href="/book/my-passes"
              className="inline-flex min-h-[44px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 sm:px-2.5"
            >
              <Ticket aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('common.myPasses')}</span>
            </Link>
            <Link
              href="/login"
              aria-label={t('header.organiserLogin')}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm font-semibold text-slate-600 hover:bg-orange-50 sm:px-2.5"
            >
              <LogIn aria-hidden className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t('header.organiserLogin')}</span>
            </Link>
            <LanguageMenu />
          </nav>
        </div>
      </header>

      <main className={cx('mx-auto w-full flex-1 px-4 py-4', wide ? 'max-w-5xl' : 'max-w-2xl', bottomPad && 'pb-36')}>
        <SlowServerNotice className="mb-4" />
        {children}
      </main>

      <footer className={cx('no-print border-t border-orange-100 bg-white/60', bottomPad && 'mb-28')}>
        <div className={cx('mx-auto flex flex-col gap-3 px-4 py-6 text-sm text-slate-500 lg:flex-row lg:items-center lg:gap-6', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <LogoMark className="h-5 w-5" />
            <span className="font-semibold text-slate-700">Parvsetu</span>
            <span>· {t('footer.festivalPasses')}</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 lg:ml-auto lg:justify-end">
            <Link href="/" className="hover:text-orange-700">
              {t('common.browseFestivals')}
            </Link>
            <Link href="/book/my-passes" className="hover:text-orange-700">
              {t('common.myPasses')}
            </Link>
            <Link href="/login" className="hover:text-orange-700">
              {t('footer.forOrganisers')}
            </Link>
            <Link href="/register?type=mandal" className="hover:text-orange-700">
              {t('footer.registerMandal')}
            </Link>
            <Link href="/partner/signup" className="hover:text-orange-700">
              {t('footer.becomePartner')}
            </Link>
            <Link href="/legal/content-policy" className="hover:text-orange-700">
              {t('footer.contentPolicy')}
            </Link>
            <Link href="/faq" className="hover:text-orange-700">
              {t('footer.helpFaq')}
            </Link>
          </div>
        </div>
        <div className={cx('mx-auto px-4 pb-6', wide ? 'max-w-5xl' : 'max-w-2xl')}>
          <LanguageLinks className="-ml-2" />
        </div>
      </footer>
    </div>
  );
}
