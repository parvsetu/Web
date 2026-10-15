'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useT } from '@/lib/i18n/provider';
import { isStandalone } from '../InstallPrompt';

/**
 * Pass page in Safari on iPhone: links always open in Safari, and the
 * home-screen app keeps separate storage — so offer the pass link to copy
 * into the app (My passes → Add a pass).
 */
export function CopyToApp() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setShow(ios && !isStandalone());
  }, []);
  if (!show) return null;
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
      <span className="min-w-0 flex-1">{t('pass.toApp')}</span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            window.prompt(t('pass.copyLink'), window.location.href);
          }
        }}
        className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 font-semibold"
      >
        {copied ? <Check aria-hidden className="h-4 w-4 text-green-600" /> : <Copy aria-hidden className="h-4 w-4" />} {copied ? t('pass.copied') : t('pass.copyLink')}
      </button>
    </div>
  );
}
