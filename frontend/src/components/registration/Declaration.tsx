'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { CONTENT_POLICY_RULE, DECLARATION_TEXT } from '@/lib/legal';
import { cx } from '../ui';

/** The mandatory content-policy declaration, shown prominently above every submit button. */
export function Declaration({ checked, onChange, error, onBehalf }: { checked: boolean; onChange: (v: boolean) => void; error?: string | null; onBehalf?: boolean }) {
  return (
    <div className={cx('rounded-2xl border-2 p-4', error ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50')}>
      <p className="flex items-start gap-2 font-bold text-amber-950">
        <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" /> Content policy — please read
      </p>
      <p className="mt-2 text-sm leading-relaxed text-amber-950">{CONTENT_POLICY_RULE}</p>
      <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-amber-200">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-orange-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="text-sm leading-relaxed text-slate-800">
          {onBehalf ? <strong>On behalf of the mandal: </strong> : null}
          {DECLARATION_TEXT}
        </span>
      </label>
      <p className="mt-2 text-xs text-amber-900">
        <Link href="/legal/content-policy" target="_blank" className="font-semibold underline">Read the full content policy</Link> · Events that break it are rejected or unpublished.
      </p>
      {error && <p className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
