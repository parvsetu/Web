'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { BadgeCheck, Building2, CalendarDays, CircleX, CreditCard, Lock, MapPin, PartyPopper, Smartphone, Timer } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { fmtDate, fmtMoney, humanize } from '@/lib/format';
import { PublicShell } from '@/components/booking/PublicShell';
import { FestivalBadge } from '@/components/FestivalBanner';
import { Alert, Button, Skeleton, cx } from '@/components/ui';

interface FeeLink {
  amount: string;
  status: 'PENDING' | 'PAID' | 'WAIVED' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED';
  expiresAt: string;
  paidAt: string | null;
  event: { name: string; festivalType: string; startDate: string; endDate: string; location: string | null; city: string | null; live: boolean };
  organization: { name: string; city: string | null };
  demoPayments: boolean;
}

/** Public, shareable pay link for one festival's registration fee (/pay/event-fee/<token>). */
export default function EventFeePayPage() {
  const { token } = useParams<{ token: string }>();
  const [link, setLink] = useState<FeeLink | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'success' | 'fail' | null>(null);
  const [method, setMethod] = useState<'upi' | 'card'>('upi');

  const load = useCallback(async () => {
    try {
      setLink(await api.get<FeeLink>(`/public/event-fee/${token}`, undefined, { noAuthRedirect: true }));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [token]);
  useEffect(() => void load(), [load]);

  async function pay(outcome: 'success' | 'fail') {
    setError(null);
    setBusy(outcome);
    try {
      const r = await api.post<FeeLink>(`/public/event-fee/${token}/demo-pay`, { outcome }, { noAuthRedirect: true });
      setLink(r);
      if (outcome === 'fail') setError('Payment failed (simulated). Nothing was charged — you can try again.');
    } catch (e) {
      setError(errorMessage(e));
      void load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <PublicShell>
      {loadError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <CircleX aria-hidden className="h-12 w-12 text-red-500" />
          <h1 className="text-xl font-bold">Payment link not found</h1>
          <p className="text-slate-600">{loadError}</p>
        </div>
      ) : !link ? (
        <div className="flex flex-col gap-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-orange-100">
            <div className="bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 p-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/85">Festival registration fee</p>
              <p className="mt-1 text-4xl font-black tabular-nums">{fmtMoney(link.amount)}</p>
              <p className="text-sm text-white/90">One-time fee to publish this festival on Parvsetu</p>
            </div>
            <div className="flex items-start gap-3 p-4">
              <FestivalBadge type={link.event.festivalType} className="h-14 w-14 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-700">{humanize(link.event.festivalType)}</p>
                <h1 className="break-words text-lg font-extrabold leading-tight text-slate-900">{link.event.name}</h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600"><Building2 aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{link.organization.name}{link.organization.city ? `, ${link.organization.city}` : ''}</span></p>
                <p className="flex items-center gap-1.5 text-sm text-slate-600"><CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> {fmtDate(link.event.startDate)} – {fmtDate(link.event.endDate)}</p>
                {link.event.location && <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin aria-hidden className="h-4 w-4 shrink-0 text-slate-400" /> <span className="truncate">{link.event.location}</span></p>}
              </div>
            </div>
          </section>

          {link.status === 'PAID' || link.status === 'WAIVED' ? (
            <section className="flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br from-emerald-500 to-green-600 p-6 text-center text-white shadow-lg">
              <BadgeCheck aria-hidden className="h-12 w-12" />
              <h2 className="text-xl font-extrabold">{link.status === 'PAID' ? 'Payment received' : 'Fee waived'}</h2>
              <p className="text-sm text-white/90">{link.event.live ? `${link.event.name} is now live on Parvsetu.` : 'Thank you.'}</p>
              <Link href="/login" className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 font-semibold text-green-700">
                <PartyPopper aria-hidden className="h-4 w-4" /> Open your mandal dashboard
              </Link>
            </section>
          ) : link.status !== 'PENDING' ? (
            <Alert kind="warning">
              This payment link is {link.status === 'EXPIRED' ? 'expired' : link.status.toLowerCase()}. Ask the Parvsetu team (or your agent) to send you a new one.
            </Alert>
          ) : (
            <section className="flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-orange-100">
              <p className="flex items-center gap-2 text-sm text-slate-600"><Timer aria-hidden className="h-4 w-4 text-orange-500" /> Link valid till {fmtDate(link.expiresAt.slice(0, 10))}</p>
              {link.demoPayments ? (
                <>
                  <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-2 gap-2">
                    {([['upi', 'UPI', Smartphone], ['card', 'Card', CreditCard]] as const).map(([k, label, Icon]) => (
                      <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => setMethod(k)}
                        className={cx('flex min-h-[52px] items-center justify-center gap-2 rounded-xl font-semibold', method === k ? 'bg-orange-500 text-white shadow-sm' : 'bg-orange-50 text-orange-900 ring-1 ring-orange-200')}>
                        <Icon aria-hidden className="h-5 w-5" /> {label}
                      </button>
                    ))}
                  </div>
                  <Button size="lg" loading={busy === 'success'} disabled={!!busy} onClick={() => void pay('success')}>
                    {busy !== 'success' && <Lock aria-hidden className="h-5 w-5" />} Pay {fmtMoney(link.amount)}
                  </Button>
                  <button type="button" disabled={!!busy} onClick={() => void pay('fail')} className="min-h-[40px] text-sm font-semibold text-slate-500 hover:text-red-600">
                    Simulate a failed payment
                  </button>
                  <p className="text-center text-xs text-slate-500">Demo checkout — no real money moves.</p>
                </>
              ) : (
                <Alert kind="info">Online payment isn’t switched on yet. Pay the Parvsetu team by bank transfer or UPI and share the reference — they will mark it paid.</Alert>
              )}
              {error && <Alert>{error}</Alert>}
            </section>
          )}
          <p className="text-center text-xs text-slate-500">
            Each festival is paid separately. By paying you confirm the festival follows the <Link href="/legal/content-policy" className="underline">content policy</Link>.
          </p>
        </div>
      )}
    </PublicShell>
  );
}
