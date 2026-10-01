'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Check, Copy, LinkIcon, Printer, ReceiptText, RotateCcw, Share2 } from 'lucide-react';
import { PublicShell } from '@/components/booking/PublicShell';
import { DonationReceipt } from '@/components/DonationReceipt';
import { Alert, Button, Empty, Skeleton } from '@/components/ui';
import { ApiError, api, errorMessage } from '@/lib/api';
import type { Receipt } from '@/lib/types';

export default function PublicReceiptPage() {
  return (
    <PublicShell>
      <Suspense fallback={<ReceiptSkeleton />}>
        <ReceiptView />
      </Suspense>
    </PublicShell>
  );
}

function ReceiptView() {
  const { donationId } = useParams<{ donationId: string }>();
  const k = useSearchParams().get('k') ?? '';
  const [r, setR] = useState<Receipt | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setR(await api.get<Receipt>(`/public/receipts/${encodeURIComponent(donationId)}`, { k }, { noAuthRedirect: true }));
    } catch (e) {
      setError({ status: e instanceof ApiError ? e.status : 0, message: errorMessage(e) });
    }
  }, [donationId, k]);

  useEffect(() => {
    if (k) void load();
  }, [k, load]);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  if (!k) {
    return (
      <Empty title="This receipt link is incomplete" icon={LinkIcon}>
        Open the full link you received from the mandal (it ends with <span className="font-mono">?k=…</span>).
      </Empty>
    );
  }
  if (error && !r) {
    return error.status === 404 ? (
      <Empty title="Receipt not found" icon={ReceiptText}>
        This link doesn’t match any receipt. Check that you copied the whole link, or ask the mandal to send it again.
        <div className="mt-4">
          <Link href="/book" className="font-semibold text-orange-700 hover:underline">
            Browse festivals
          </Link>
        </div>
      </Empty>
    ) : (
      <Alert>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{error.message}</span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RotateCcw aria-hidden className="h-4 w-4" /> Retry
          </Button>
        </div>
      </Alert>
    );
  }
  if (!r) return <ReceiptSkeleton />;

  async function share() {
    const url = window.location.href;
    try {
      if (canShare) await navigator.share({ title: `Donation receipt ${r!.receiptNo}`, text: `Donation receipt — ${r!.event.name}`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">Thank you, {r.donorName.split(' ')[0]} 🙏</h1>
        <p className="text-sm text-slate-600">Your donation receipt from {r.organization.name}. Print it or save it as a PDF for your records.</p>
      </div>
      <DonationReceipt r={r} />
      <div className="no-print mx-auto grid w-full max-w-xl grid-cols-2 gap-2">
        <Button className="min-h-[56px]" onClick={() => window.print()}>
          <Printer aria-hidden className="h-5 w-5" /> Print / PDF
        </Button>
        <Button className="min-h-[56px]" variant="secondary" onClick={() => void share()}>
          {canShare ? <Share2 aria-hidden className="h-5 w-5" /> : copied ? <Check aria-hidden className="h-5 w-5 text-green-600" /> : <Copy aria-hidden className="h-5 w-5" />}
          {canShare ? 'Share' : copied ? 'Copied!' : 'Copy link'}
        </Button>
      </div>
      <p className="no-print text-center text-xs text-slate-500">Tip: in the print dialog, choose “Save as PDF” as the printer.</p>
    </div>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4" aria-busy="true" aria-label="Loading receipt">
      <Skeleton className="mx-auto h-8 w-56" />
      <div className="overflow-hidden rounded-3xl border border-orange-100 bg-white">
        <Skeleton className="h-28 rounded-none" />
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}
