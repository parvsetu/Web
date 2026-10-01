'use client';

import { useState } from 'react';
import { Check, Copy, CreditCard, MessageCircle } from 'lucide-react';
import { fmtDate, fmtMoney } from '@/lib/format';
import { APPROVAL_LABEL, type FeePayment } from '@/lib/registration-types';
import type { ApprovalStatus } from '@/lib/types';
import { Badge, cx } from '../ui';

const APPROVAL_TONE: Record<ApprovalStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-800',
  CHANGES_REQUESTED: 'bg-orange-100 text-orange-800',
  APPROVED_AWAITING_PAYMENT: 'bg-violet-100 text-violet-800',
  LIVE: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export function ApprovalBadge({ status, className }: { status: ApprovalStatus; className?: string }) {
  return <Badge className={cx(APPROVAL_TONE[status], className)}>{APPROVAL_LABEL[status]}</Badge>;
}

/** Copy / WhatsApp / open a pay link. */
export function PayLinkActions({ url, text, compact }: { url: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cx('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 px-3 text-sm font-semibold text-white shadow-sm">
        <CreditCard aria-hidden className="h-4 w-4 shrink-0" /> <span className="truncate">Pay</span>
      </a>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white shadow-sm">
        <MessageCircle aria-hidden className="h-4 w-4 shrink-0" /> <span className="truncate">WhatsApp</span>
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt('Copy this link', url);
          }
        }}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3 text-sm font-semibold text-slate-800"
      >
        {copied ? <Check aria-hidden className="h-4 w-4 shrink-0 text-green-600" /> : <Copy aria-hidden className="h-4 w-4 shrink-0" />}
        <span className="truncate">{copied ? 'Copied' : 'Copy link'}</span>
      </button>
    </div>
  );
}

export function paymentLine(p: FeePayment | null): string {
  if (!p) return '';
  switch (p.status) {
    case 'PAID': return `Paid ${fmtMoney(p.amount)}${p.paidAt ? ` on ${fmtDate(p.paidAt.slice(0, 10))}` : ''}${p.method && p.method !== 'ONLINE' ? ` (${p.method.replace('_', ' ').toLowerCase()})` : ''}`;
    case 'WAIVED': return 'Fee waived by Parvsetu';
    case 'REFUNDED': return `Refunded${p.refundReason ? ` — ${p.refundReason}` : ''}`;
    case 'PENDING': return `${fmtMoney(p.amount)} due · link valid till ${fmtDate(p.expiresAt.slice(0, 10))}`;
    case 'EXPIRED': return 'Pay link expired — ask the Parvsetu team for a new one';
    default: return p.status.toLowerCase();
  }
}
