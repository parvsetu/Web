'use client';

import { useEffect, useRef, useState } from 'react';
import { ClipboardPaste, RefreshCw } from 'lucide-react';
import { Button, cx } from './ui';

/** First 6-digit run in some text (pasted email line, "Your code: 123 456" …). */
export function extractCode(text: string): string | null {
  const m = text.replace(/[\s-]/g, '').match(/\d{6}/);
  return m ? m[0] : null;
}

/**
 * The code from a "Verify automatically" email link (`#code=123456`). The fragment
 * never reaches a server; it's removed from the address bar once read.
 */
export function useCodeFromLink(onCode: (code: string) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const m = window.location.hash.match(/(?:^#|&)code=(\d{6})(?:&|$)/);
    if (!m) return;
    try {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    } catch {
      /* ignore */
    }
    onCode(m[1]);
  }, [onCode]);
}

/**
 * Six-box numeric code entry: typing moves along, paste / phone autofill fills
 * every box, a "Paste code" button reads the clipboard, and `onComplete` fires
 * as soon as the 6th digit lands (so pages can verify without another tap).
 */
export function OtpInput({ value, onChange, disabled, onComplete }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; onComplete?: (code: string) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');
  const [canPaste, setCanPaste] = useState(false);
  const [pasteError, setPasteError] = useState(false);

  useEffect(() => {
    setCanPaste(typeof navigator !== 'undefined' && !!navigator.clipboard?.readText);
  }, []);

  function commit(next: string) {
    const v = next.replace(/\D/g, '').slice(0, 6);
    onChange(v);
    if (v.length === 6 && v !== value) onComplete?.(v);
  }

  function setAt(i: number, d: string) {
    commit(value.slice(0, i) + d + value.slice(i + 1));
  }

  async function pasteFromClipboard() {
    setPasteError(false);
    try {
      const code = extractCode(await navigator.clipboard.readText());
      if (!code) return setPasteError(true);
      commit(code);
      refs.current[5]?.focus();
    } catch {
      setPasteError(true);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            disabled={disabled}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`Digit ${i + 1}`}
            maxLength={6}
            className={cx(
              'h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 transition focus:outline-none focus:ring-4 focus:ring-orange-500/20',
              d ? 'border-orange-400' : 'border-orange-200',
              value.length === 6 && 'border-emerald-400 bg-emerald-50',
            )}
            onFocus={(e) => e.target.select()}
            onPaste={(e) => {
              const code = extractCode(e.clipboardData.getData('text'));
              if (!code) return;
              e.preventDefault();
              commit(code);
              refs.current[5]?.focus();
            }}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '');
              if (v.length > 1) {
                // paste / phone autofill of the whole code
                commit(v);
                refs.current[Math.min(5, v.length - 1)]?.focus();
                return;
              }
              setAt(i, v);
              if (v && i < 5) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
              if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
            }}
          />
        ))}
      </div>
      {canPaste && !disabled && value.length < 6 && (
        <button type="button" onClick={pasteFromClipboard} className="inline-flex items-center gap-1.5 self-center rounded-full px-3 py-1 text-sm font-semibold text-orange-700 hover:bg-orange-50">
          <ClipboardPaste aria-hidden className="h-4 w-4" /> Paste code
        </button>
      )}
      {pasteError && <p className="text-center text-xs text-slate-500">No 6-digit code on the clipboard — copy it from the email first.</p>}
    </div>
  );
}

/** "Resend code" with a visible cooldown that mirrors the server's 60 s limit. */
export function ResendButton({ onResend, initialWait = 60 }: { onResend: () => Promise<void>; initialWait?: number }) {
  const [wait, setWait] = useState(initialWait);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={wait > 0}
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setWait(60);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy && <RefreshCw aria-hidden className="h-4 w-4" />}
      {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
    </Button>
  );
}
