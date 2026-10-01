'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, cx } from './ui';

/** Six-box numeric code entry; supports paste and SMS/email autofill. */
export function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  function setAt(i: number, d: string) {
    const next = (value.slice(0, i) + d + value.slice(i + 1)).replace(/\D/g, '').slice(0, 6);
    onChange(next);
  }

  return (
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
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          maxLength={6}
          className={cx(
            'h-14 w-full min-w-0 rounded-xl border-2 bg-white text-center text-2xl font-bold tabular-nums text-slate-900 focus:outline-none focus:ring-4 focus:ring-orange-500/20',
            d ? 'border-orange-400' : 'border-orange-200',
          )}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '');
            if (v.length > 1) {
              // paste / autofill of the whole code
              onChange(v.slice(0, 6));
              refs.current[Math.min(5, v.length - 1)]?.focus();
              return;
            }
            setAt(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
          }}
        />
      ))}
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
