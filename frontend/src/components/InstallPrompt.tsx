'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import { Button, cx } from './ui';

/** Chrome / Edge / Android: the browser's own install dialog, deferred until the user asks. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'parvsetu.installDismissedAt';
const SNOOZE_MS = 14 * 86400_000;

/** Already opened from the home screen (iOS sets navigator.standalone; others the display-mode). */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIOS() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function snoozed() {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * "Add Parvsetu to your home screen". iPhones have no install button for
 * websites, so they get the Share → Add to Home Screen steps; Chrome and
 * Android get a real Install button. Hidden once installed, and for two
 * weeks after "Not now".
 */
export function InstallPrompt({ variant = 'visitor', className }: { variant?: 'visitor' | 'scanner'; className?: string }) {
  const { t } = useT();
  const [mode, setMode] = useState<'ios' | 'prompt' | null>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;
    if (isIOS()) {
      setMode('ios');
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setMode('prompt');
    };
    const onInstalled = () => setMode(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setMode(null);
  };
  const install = async () => {
    const e = deferred.current;
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    deferred.current = null;
    if (outcome === 'accepted') setMode(null);
  };

  const title = variant === 'scanner' ? 'Add the scanner to your home screen' : t('install.title');
  const body = variant === 'scanner' ? 'It opens full screen in one tap, and the screen stays on while you scan.' : t('install.body');

  return (
    <div className={cx('no-print relative flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-3 pr-10 text-sm', className)} role="region" aria-label={title}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-orange-600 shadow-sm">
        <Smartphone aria-hidden className="h-5 w-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-bold text-slate-900">{title}</p>
        <p className="text-slate-700">{body}</p>
        {mode === 'ios' ? (
          <p className="flex flex-wrap items-center gap-1 font-medium text-slate-800">
            <Share aria-hidden className="h-4 w-4 text-sky-600" /> {t('install.iosSteps')}
          </p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void install()}>
              <Download aria-hidden className="h-4 w-4" /> {t('install.button')}
            </Button>
            <Button size="sm" variant="secondary" onClick={dismiss}>{t('install.later')}</Button>
          </div>
        )}
      </div>
      <button type="button" onClick={dismiss} aria-label={t('install.later')} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
