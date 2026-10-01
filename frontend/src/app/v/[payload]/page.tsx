'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { LogIn, ScanLine, ShieldCheck, Ticket } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { AuthCard } from '@/components/AuthCard';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Alert, Skeleton } from '@/components/ui';

/**
 * Where a pass QR lands when scanned with an ordinary phone camera. It never
 * redeems anything: entry is only granted by an authorised volunteer through
 * the Parvsetu scanner (POST /tokens/scan), which re-checks everything.
 */
export default function PassLinkPage() {
  const params = useParams<{ payload: string }>();
  const payload = decodeURIComponent(params.payload ?? '');
  const { me, loading } = useAuth();
  const scanEvents = (me?.events ?? []).filter((e) => e.status === 'ACTIVE' && can(e.permissions, 'TOKEN_SCAN'));
  const looksValid = payload.startsWith('PSQR1.');

  return (
    <AuthCard title="Parvsetu entry pass" subtitle="Show this QR at the festival gate.">
      <div className="flex flex-col gap-4">
        {!looksValid && <Alert>This link does not contain a valid Parvsetu pass.</Alert>}
        <div className="flex items-start gap-3 rounded-2xl bg-orange-50 p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white">
            <ShieldCheck aria-hidden className="h-6 w-6" />
          </span>
          <p className="text-sm text-slate-700">
            This pass can only be verified by an authorised volunteer using the <b>Parvsetu scanner</b>. Opening this page does not use up the pass.
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-16" />
        ) : scanEvents.length > 0 && looksValid ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-slate-700">You are a gate volunteer. Verify this pass in:</p>
            {scanEvents.map((e) => (
              <Link
                key={e.id}
                href={`/e/${e.id}/scan#p=${encodeURIComponent(payload)}`}
                className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-3 font-semibold shadow-sm hover:bg-emerald-50"
              >
                <FestivalBadge type={e.festivalType} className="h-11 w-11" />
                <span className="flex-1">{e.name}</span>
                <span className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-3 py-2 text-sm text-white">
                  <ScanLine aria-hidden className="h-4 w-4" /> Verify in scanner
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Link href="/book/my-passes" className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-orange-200 bg-white font-semibold text-orange-800 hover:bg-orange-50">
              <Ticket aria-hidden className="h-5 w-5" /> My passes on this phone
            </Link>
            {!me && (
              <Link href="/login" className="flex min-h-[48px] items-center justify-center gap-2 text-sm font-semibold text-slate-600 underline">
                <LogIn aria-hidden className="h-4 w-4" /> Volunteer? Log in to verify
              </Link>
            )}
          </div>
        )}
      </div>
    </AuthCard>
  );
}
