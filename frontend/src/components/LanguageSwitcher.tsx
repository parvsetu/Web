'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, Globe } from 'lucide-react';
import { LANGUAGES, langInfo, type Lang } from '@/lib/i18n/config';
import { useT } from '@/lib/i18n/provider';
import { cx } from '@/lib/cx';

/**
 * Compact globe button opening a small language menu: each language in its
 * own script with the English name underneath. Keyboard: ↑/↓/Home/End move,
 * Enter/Space pick, Escape or Tab closes (focus returns to the button).
 */
export function LanguageMenu({ className, showCode }: { className?: string; /** Show the short code (e.g. "हि") next to the globe from sm up. */ showCode?: boolean }) {
  const { preferred, setLang, t } = useT();
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) items.current[focus]?.focus();
  }, [open, focus]);

  function openMenu() {
    setFocus(Math.max(0, LANGUAGES.findIndex((l) => l.code === preferred)));
    setOpen(true);
  }
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) btn.current?.focus();
  }
  function pick(l: Lang) {
    close();
    if (l !== preferred) setLang(l);
  }
  function onMenuKey(e: React.KeyboardEvent) {
    const n = LANGUAGES.length;
    if (e.key === 'ArrowDown') setFocus((f) => (f + 1) % n);
    else if (e.key === 'ArrowUp') setFocus((f) => (f - 1 + n) % n);
    else if (e.key === 'Home') setFocus(0);
    else if (e.key === 'End') setFocus(n - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') return setOpen(false);
    else return;
    e.preventDefault();
  }

  const current = langInfo(preferred);
  return (
    <div ref={wrap} className={cx('relative', className)}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('lang.choose')} — ${current.native}`}
        title={t('lang.label')}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openMenu();
          }
        }}
        className="inline-flex h-11 min-w-[40px] items-center justify-center gap-1 rounded-full px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/30"
      >
        <Globe aria-hidden className="h-5 w-5 shrink-0" />
        {showCode && <span className="hidden max-w-[5rem] truncate lg:inline">{current.native}</span>}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('lang.choose')}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-50 mt-1 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-orange-100 bg-white py-1 shadow-xl shadow-orange-900/10"
        >
          {LANGUAGES.map((l, i) => {
            const sel = l.code === preferred;
            return (
              <button
                key={l.code}
                ref={(el) => {
                  items.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={sel}
                lang={l.code}
                tabIndex={i === focus ? 0 : -1}
                onClick={() => pick(l.code)}
                className={cx(
                  'flex min-h-[48px] w-full items-center gap-3 px-3 text-left hover:bg-orange-50 focus:bg-orange-50 focus:outline-none',
                  sel && 'bg-orange-50/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[15px] leading-tight', sel ? 'font-bold text-orange-700' : 'font-semibold text-slate-900')}>{l.native}</span>
                  {l.native !== l.english && <span className="block text-xs text-slate-500" lang="en">{l.english}</span>}
                </span>
                {sel && <Check aria-hidden className="h-4 w-4 shrink-0 text-orange-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Inline list of languages for footers ("हिन्दी · বাংলা · …"). */
export function LanguageLinks({ className, dark }: { className?: string; dark?: boolean }) {
  const { preferred, setLang, t } = useT();
  return (
    <div className={cx('flex flex-wrap items-center gap-x-1 gap-y-1', className)} role="group" aria-label={t('lang.label')}>
      <Globe aria-hidden className={cx('mr-1 h-4 w-4 shrink-0', dark ? 'text-slate-500' : 'text-slate-400')} />
      {LANGUAGES.map((l) => {
        const sel = l.code === preferred;
        return (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={sel}
            title={l.english}
            onClick={() => !sel && setLang(l.code)}
            className={cx(
              'min-h-[36px] rounded-lg px-2 text-sm',
              sel
                ? dark
                  ? 'bg-slate-800 font-bold text-white'
                  : 'bg-orange-100 font-bold text-orange-800'
                : dark
                  ? 'text-slate-300 hover:text-white'
                  : 'text-slate-600 hover:text-orange-700',
            )}
          >
            {l.native}
          </button>
        );
      })}
    </div>
  );
}
